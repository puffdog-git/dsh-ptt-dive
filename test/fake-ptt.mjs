// 假的 PTT 終端機：照真實畫面的提示文字回應按鍵，並記下收到的每一段按鍵。
// 只模擬本插件會走到的畫面；它證明的是「程式照這套畫面流程運作」，不是真實 PTT 的行為。
const ENTER = '\r';
const LEFT = '\x1bOD';
const GO_MAIN = ' ' + LEFT.repeat(5);
const CLEAR = '\x1b[2J\x1b[H';

const WELCOME = CLEAR + '批踢踢實業坊\r\n請輸入代號，或以 guest 參觀，或以 new 註冊: ';
const MAIN = CLEAR + '【主功能表】 批踢踢實業坊\r\n (A)nnounce 精華公佈欄\r\n (G)oodbye 離開，再見\r\n';
const BOARD = (name) => CLEAR + `【板主:someone】 看板《${name}》\r\n[←]離開 [→]閱讀 [Ctrl-P]發表文章 [d]刪除 [z]精華區 [i]看板資訊/設定 [h]說明\r\n   編號    日 期 作  者       文  章  標  題\r\n 文章選讀  (y)回應(X)推文(^X)轉錄 (=[]<>)相關主題(/?a)找標題/作者 (b)進板畫面\r\n`;

/**
 * options:
 *   accounts            { id: password }
 *   articles            { 'Board/AID': { options: '1.值得推薦 2.給它噓聲 3.只加→註解' | 'arrow-only' | 'too-fast' | 'forbidden' | 'muted' } }
 *   afterPassword       登入後、主選單前依序出現的畫面（'duplicate' | 'failed-attempts' | 'any-key'）
 *   loginScreen         取代正常登入結果的畫面文字（例如兩階段認證）
 *   wrongInfoAid        查詢文章資訊時顯示另一個 AID（模擬游標停在別篇文章）
 *   silentAfterPush     推文按鍵送出後不回任何畫面（模擬結果不確定）
 *   posting             { 看板: 'muted' | 'no-permission' | 'wrong-board' | 'silent' }（發新文章時的狀況）
 *   articles[..].reply  回文時的狀況：'closed' | 'no-reply' | 'no-permission' | 'warning' | 'silent'（存檔後不回畫面）
 */
export function fakePtt(options = {}) {
  const { accounts = { tester: 'secret-pw' }, articles = {}, afterPassword = [], loginScreen, wrongInfoAid, silentAfterPush = false, posting = {} } = options;
  const log = { sent: [], pushes: [], replies: [], posts: [], connections: 0, logouts: 0 };

  const connect = async () => {
    log.connections += 1;
    const dataListeners = new Set();
    const closeListeners = new Set();
    let closed = false;
    let state = 'welcome';
    let id = '';
    let board = '';
    let pendingScreens = [];
    let target = null;
    let draftPost = null;
    const emit = (text) => queueMicrotask(() => !closed && dataListeners.forEach((fn) => fn(Buffer.from(text, 'utf8'))));
    const close = () => {
      if (closed) return;
      closed = true;
      closeListeners.forEach((fn) => fn());
    };
    const nextLoginScreen = () => {
      const next = pendingScreens.shift();
      if (next === 'duplicate') return (state = 'login-prompt'), emit('注意: 您有其它連線已登入此帳號。\r\n您想刪除其他重複登入的連線嗎？[Y/n] ');
      if (next === 'failed-attempts') return (state = 'login-prompt'), emit('您要刪除以上錯誤嘗試的記錄嗎? [Y/n] ');
      if (next === 'any-key') return (state = 'login-prompt'), emit('歡迎您再度拜訪，上次您是從 somewhere 連往本站。\r\n請按任意鍵繼續');
      state = 'main';
      emit(MAIN);
    };

    const receive = (bytes) => {
      const text = bytes.toString('utf8');
      log.sent.push(state === 'password' ? '<password>' : text);
      if (state === 'welcome') {
        id = text.replace(/,?\r$/, '');
        state = 'password';
        return emit('\r\n請輸入您的密碼: ');
      }
      if (state === 'password') {
        if (loginScreen) return emit(loginScreen);
        if (accounts[id] !== text.replace(/\r$/, '')) return emit('\r\n密碼不對或無此帳號。請檢查大小寫及有無輸入錯誤。\r\n');
        emit('\r\n密碼正確！ 開始登入系統...\r\n');
        pendingScreens = [...afterPassword];
        return nextLoginScreen();
      }
      if (state === 'login-prompt') return nextLoginScreen();

      if (text.startsWith(GO_MAIN + 'g' + ENTER)) {
        log.logouts += 1;
        emit('此次停留時間: 0 小時 1 分\r\n請按任意鍵繼續');
        return;
      }
      if (text.startsWith(GO_MAIN + 'qs')) {
        board = text.slice((GO_MAIN + 'qs').length).split(ENTER)[0];
        state = 'board';
        return emit(BOARD(board));
      }
      if (state === 'board' && text.startsWith('#')) {
        const aid = text.slice(1, 9);
        target = articles[board + '/' + aid] ? { aid, ...articles[board + '/' + aid] } : null;
        if (!target) return emit('找不到這個文章代碼(AID)，可能是文章已消失，或是你找錯看板了\r\n');
        state = 'info';
        return emit(CLEAR + `文章代碼(AID): #${wrongInfoAid || aid} (${board}) [ptt.cc] [閒聊] 標題\r\n文章網址: https://www.ptt.cc/bbs/${board}/M.1.A.AAA.html\r\n這一篇文章值 10 Ptt幣\r\n請按任意鍵繼續`);
      }
      if (state === 'info') {
        state = 'board';
        return emit(BOARD(board));
      }
      // ---- 發新文章 ----
      if (state === 'board' && text === '\x10') {
        const mode = posting[board];
        if (mode === 'muted') return emit('◆ 使用者不可發言\r\n');
        if (mode === 'no-permission') return emit('◆ 無法發文: 未達看板要求權限\r\n');
        state = 'compose';
        return emit(CLEAR + `發表文章於【 ${mode === 'wrong-board' ? 'Other' : board} 】 看板\r\n種類：1.問題 2.閒聊 (1-2或不選)？ `);
      }
      if (state === 'compose') {
        if (text === '\x03') return (state = 'board'), emit(BOARD(board));
        const match = /^([0-9]?)\r([^\r]*)\r(\x19*)([\s\S]*)\r\x18$/.exec(text);
        draftPost = match ? { board, category: match[1], title: match[2], cleared: match[3].length, lines: match[4].split(ENTER), by: id } : null;
        state = 'post-save';
        return emit('確定要儲存檔案嗎？ (S)儲存 (A)放棄 (E)繼續 (T)改標題 [S]: ');
      }
      if (state === 'post-save') {
        if (posting[board] === 'silent') return (state = 'board'), void log.posts.push(draftPost);
        state = 'post-sign';
        return emit('x=隨機 請選擇簽名檔 (1-9, 0=不加)[0]: ');
      }
      if (state === 'post-sign') {
        log.posts.push({ ...draftPost, signature: text });
        state = 'board';
        return emit('請按任意鍵繼續');
      }

      // ---- 回文 ----
      if (state === 'board' && text === ENTER + 'r') {
        const mode = target?.reply;
        if (mode === 'closed') return emit('◆ 很抱歉, 此文章已結案並標記, 不得回應\r\n');
        if (mode === 'no-reply') return emit('◆ 很抱歉, 本板不開放回覆文章\r\n');
        if (mode === 'no-permission') return emit('◆ 無法發文: 未達看板要求權限\r\n');
        state = 'reply-to';
        return emit('▲ 回應至 (F)看板 (M)作者信箱 (B)二者皆是 (Q)取消？[F] ');
      }
      if (state === 'reply-to') return (state = 'reply-title'), emit('採用原標題[Y/n]? ');
      if (state === 'reply-title') return (state = 'reply-quote'), emit('請問要引用原文嗎(Y/N/All/Repost)?[Y] ');
      if (state === 'reply-quote') return (target.quoteAnswer = text), (state = 'editor'), emit(CLEAR + '編輯文章  (^Z/F1)說明 (^P/^X)檔案 (^O)插入符號\r\n※ 引述《someone (暱稱)》之銘言：\r\n: 原文第一行\r\n');
      if (state === 'editor') {
        target.draftBody = text.replace(/\r\x18$/, '').split(ENTER);
        if (target.reply === 'warning') return (state = 'board'), emit('引言太多。(E)繼續編輯 (W)強制寫入？[E] ');
        state = 'reply-save';
        return emit('確定要儲存檔案嗎？ (S)儲存 (A)放棄 (E)繼續 (T)改標題 [S]: ');
      }
      if (state === 'reply-save') {
        if (target.reply === 'silent') return (state = 'board'), log.replies.push({ board, aid: target.aid, lines: target.draftBody, by: id });
        state = 'reply-sign';
        return emit('x=隨機 請選擇簽名檔 (1-9, 0=不加)[0]: ');
      }
      if (state === 'reply-sign') {
        log.replies.push({ board, aid: target.aid, lines: target.draftBody, by: id, signature: text, quote: target.quoteAnswer });
        state = 'board';
        return emit('請按任意鍵繼續');
      }

      if (state === 'board' && text === 'X') {
        const kind = target?.options || '1.值得推薦 2.給它噓聲 3.只加→註解';
        if (kind === 'too-fast') return emit('本板禁止快速連續推文，請再等 30 秒\r\n');
        if (kind === 'forbidden') return emit('◆ 抱歉, 禁止推薦\r\n');
        if (kind === 'muted') return emit('◆ 使用者不可發言\r\n');
        state = 'push';
        if (kind === 'arrow-only') return emit(`時間太近, 使用 "→" 加註方式\r\n→ ${id}: `);
        return emit(`您覺得這篇文章 ${kind} [1]? `);
      }
      if (state === 'push') {
        if (text === '\x03') {
          state = 'board';
          return emit(BOARD(board));
        }
        const arrowOnly = target.options === 'arrow-only';
        const body = text.replace(/\x0c$/, '');
        const match = /^([123]?)([^\r]*)\ry\r$/.exec(body);
        state = 'board';
        if (match) log.pushes.push({ board, aid: target.aid, kind: arrowOnly ? 'arrow' : { 1: 'push', 2: 'boo', 3: 'arrow' }[match[1] || '1'], text: match[2], by: id });
        if (silentAfterPush) return;
        return emit(BOARD(board));
      }
    };

    queueMicrotask(() => emit(WELCOME));
    return {
      send: receive,
      onData: (fn) => (dataListeners.add(fn), () => dataListeners.delete(fn)),
      onClose: (fn) => closeListeners.add(fn),
      close,
      get closed() {
        return closed;
      },
    };
  };
  return { connect, log };
}
