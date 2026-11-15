// PTT 終端機連線：登入、對指定文章推文、登出。
//
// PTT 的網頁版是唯讀的，推文只能走終端機介面。這裡用 WebSocket 連 wss://ws.ptt.cc/bbs，
// 送按鍵、讀回畫面文字，每一步都要比對到預期的提示才繼續；比對不到就中止，不會亂送。
// 畫面提示文字與按鍵順序參考開源專案 PyPtt（https://github.com/PyPtt/PyPtt，LGPL-3.0）的公開行為，
// 程式是另外寫的。
//
// 刻意不做的事：不踢掉使用者其他的登入連線、不刪除登入失敗紀錄、不換 IP、不偽裝成別的用戶端。
// 密碼只在送出的那一刻使用，不寫進任何記錄或錯誤訊息。
import { articleTime } from './ptt.js';

export const PTT_WS_URL = 'wss://ws.ptt.cc/bbs';
export const PTT_WS_ORIGIN = 'https://term.ptt.cc';

const ENTER = '\r';
const LEFT = '\x1bOD';
const CTRL_C = '\x03';
const CTRL_L = '\x0c'; // 請 PTT 重畫整個畫面
const CTRL_X = '\x18'; // 編輯器：存檔離開
const CTRL_P = '\x10'; // 文章列表：發表文章
const CTRL_Y = '\x19'; // 編輯器：刪掉一整行
const GO_MAIN = ' ' + LEFT.repeat(5);
const AID_TABLE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

/** 網頁版的文章代碼（M.1565335521.A.880）換成終端機用的 AID（8 個字元，不含 #）。 */
export function aidFromArticleId(id) {
  const match = /^M\.(\d{9,10})\.A\.([0-9A-F]{3})$/.exec(String(id || ''));
  if (!match) throw Object.assign(Error('這種文章代碼不能轉成終端機用的編號'), { code: 'PTT_BAD_ARTICLE' });
  const encode = (value, length) => {
    let out = '';
    for (let i = 0; i < length; i++) {
      out = AID_TABLE[value % 64] + out;
      value = Math.floor(value / 64);
    }
    return out;
  };
  return encode(Number(match[1]), 6) + encode(parseInt(match[2], 16), 2);
}

/** 文字在終端機上佔幾欄：全形字 2 欄，其他 1 欄。 */
export function displayWidth(text) {
  let width = 0;
  for (const ch of String(text || '')) width += ch.codePointAt(0) > 0x7f ? 2 : 1;
  return width;
}

/**
 * 一則推文最多幾欄。PTT 依看板設定不同：推文會顯示 IP 的看板比較短。
 * 看板是否對齊推文從網頁版看不出來，所以兩種情況都取較短的那個，保證不會被截斷。
 */
export function pushWidthLimit({ recordsIp, idLength }) {
  const id = Math.min(12, Math.max(1, Number(idLength) || 12));
  return recordsIp === false ? 46 : Math.min(32, 43 - id);
}

export const TITLE_MAX_WIDTH = 44;

/** 檢查文章標題；回傳問題說明，沒問題回傳空字串。PTT 的標題欄最多 44 欄（全形字算 2 欄）。 */
export function titleProblem(title, { category = '' } = {}) {
  const tag = String(category || '').trim();
  if (tag) {
    const issue = categoryProblem(tag);
    if (issue) return issue;
  }
  // 選了分類時 PTT 會在標題前面加上「[分類] 」，佔掉一部分欄位。
  const room = TITLE_MAX_WIDTH - (tag ? displayWidth(tag) + 3 : 0);
  return titleBodyProblem(title, room, !!tag);
}

/** 文章分類：PTT 的分類名稱最多 4 欄（兩個全形字）。 */
export function categoryProblem(category) {
  const value = String(category ?? '').trim();
  if (!value) return '';
  if (/[\s\[\]\x00-\x1f\x7f]/.test(value)) return '分類不能有空白或方括號';
  if (displayWidth(value) > 4) return '分類最多兩個全形字';
  return '';
}

/** 從發文畫面取出這個看板提供的分類（「種類：1.問題 2.閒聊 (1-2或不選)」）。回傳 [{ key, label }]。 */
export function parseCategories(screenText) {
  const text = String(screenText || '');
  const at = text.lastIndexOf('種類');
  if (at < 0) return [];
  const line = text.slice(at).split(/[\r\n]/)[0].split('(')[0];
  return [...line.matchAll(/(\d)\.([^\s\d.]+)/g)].map((m) => ({ key: m[1], label: m[2] }));
}

function titleBodyProblem(title, room, hasCategory) {
  const value = String(title ?? '');
  if (/[\x00-\x1f\x7f]/.test(value)) return '標題不能有換行或控制字元';
  if ([...value.trim()].length < 2) return '標題太短';
  if (displayWidth(value.trim()) > room) return `標題太長（${hasCategory ? '選了分類後' : ''}最多 ${Math.floor(room / 2)} 個全形字）`;
  if ([...value].some((ch) => ch.codePointAt(0) > 0xffff)) return '標題不能有表情符號（PTT 的編碼顯示不出來）';
  if (/^(?:re|fw)\s*:/i.test(value.trim())) return '新文章的標題不能用 Re: 或 Fw: 開頭';
  return '';
}

export const REPLY_LINE_WIDTH = 76;

/** 把回文內容整理成終端機編輯器吃得下的行：統一換行、去掉行尾空白、太長的行依欄寬折行。 */
export function wrapBody(text, width = REPLY_LINE_WIDTH) {
  const out = [];
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    let line = raw.replace(/\t/g, '  ').replace(/\s+$/, '');
    if (!line) {
      out.push('');
      continue;
    }
    while (displayWidth(line) > width) {
      let cols = 0;
      let cut = 0;
      for (const ch of line) {
        const w = ch.codePointAt(0) > 0x7f ? 2 : 1;
        if (cols + w > width) break;
        cols += w;
        cut += ch.length;
      }
      out.push(line.slice(0, cut));
      line = line.slice(cut);
    }
    out.push(line);
  }
  while (out.length && !out[0]) out.shift();
  while (out.length && !out.at(-1)) out.pop();
  return out;
}

const stripControl = (text) =>
  text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b[=>78DME]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

export class PttTerminalError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const IN_BOARD = [
  ['看板資訊/設定', '[i]看板設定'],
  ['文章選讀', '文章列表'],
  ['相關主題', '(b)進板'],
];
const inBoard = (screen) => IN_BOARD.every((group) => group.some((word) => screen.includes(word)));

/** 預設的連線方式：用 ws 套件開 WebSocket（需要自訂 Origin，Node 內建的 WebSocket 不一定能設）。 */
export async function defaultConnect({ url = PTT_WS_URL, origin = PTT_WS_ORIGIN, timeoutMs = 15000 } = {}) {
  const { default: WebSocket } = await import('ws');
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin, handshakeTimeout: timeoutMs, perMessageDeflate: false });
    socket.binaryType = 'nodebuffer';
    const listeners = new Set();
    let closed = false;
    socket.on('message', (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      for (const fn of listeners) fn(bytes);
    });
    socket.once('open', () =>
      resolve({
        send: (bytes) => socket.send(bytes),
        onData: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
        onClose: (fn) => socket.once('close', fn),
        close: () => {
          closed = true;
          socket.close();
        },
        get closed() {
          return closed || socket.readyState >= 2;
        },
      }),
    );
    socket.once('error', (error) => reject(new PttTerminalError('PTT_CONNECT', '連不上 PTT 的終端機介面：' + (error?.message || error))));
    socket.once('close', () => (closed = true));
  });
}

/**
 * 建立一條 PTT 終端機連線。
 * options: connect（測試時換成假的）、stepTimeoutMs、onTrace（除錯用，收到的是不含密碼的步驟名稱）。
 */
export function createTerminal({ connect = defaultConnect, stepTimeoutMs = 12000, onTrace = () => {} } = {}) {
  let link = null;
  let loggedIn = false;
  let userId = '';
  let utf8 = new TextDecoder('utf-8');
  let big5 = null;
  try {
    big5 = new TextDecoder('big5');
  } catch {}
  let screen = '';
  let waiter = null;
  let closedReason = '';

  const feed = (bytes) => {
    let text = utf8.decode(bytes, { stream: true });
    // 登入前的歡迎畫面是 Big5；兩種解碼都留著，哪一種對得上就用哪一種。
    if (big5 && !loggedIn) text += '\n' + big5.decode(bytes, { stream: true });
    screen = (screen + stripControl(text)).slice(-20000);
    waiter?.check();
  };

  const send = (text) => {
    if (!link || link.closed) throw new PttTerminalError('PTT_CLOSED', 'PTT 連線已中斷');
    screen = '';
    link.send(Buffer.from(text, 'utf8'));
  };

  /**
   * 等畫面出現 targets 裡任何一項。每項 { name, match, reply?, fail? }：
   *   reply  比對到後送出這段按鍵並繼續等
   *   fail   比對到就以這個錯誤中止
   *   其餘   回傳這一項
   * 順序就是優先順序。
   */
  function expect(targets, { timeoutMs = stepTimeoutMs, step = '' } = {}) {
    return new Promise((resolve, reject) => {
      let replies = 0;
      const finish = (fn, value) => {
        clearTimeout(timer);
        waiter = null;
        fn(value);
      };
      const timer = setTimeout(
        () => finish(reject, new PttTerminalError('PTT_UNEXPECTED_SCREEN', '等不到預期的畫面（' + step + '），已中止', { step, screenTail: screen.slice(-300) })),
        timeoutMs,
      );
      waiter = {
        check() {
          for (const target of targets) {
            const hit = typeof target.match === 'function' ? target.match(screen) : target.match.every((word) => screen.includes(word));
            if (!hit) continue;
            onTrace(step + ':' + target.name);
            if (target.fail) return finish(reject, target.fail);
            if (target.reply !== undefined) {
              if (++replies > 12) return finish(reject, new PttTerminalError('PTT_LOOP', '畫面一直重複（' + step + '），已中止', { step }));
              try {
                send(target.reply);
              } catch (error) {
                return finish(reject, error);
              }
              return;
            }
            return finish(resolve, target);
          }
        },
        closed: () => finish(reject, new PttTerminalError('PTT_CLOSED', closedReason || 'PTT 中斷了連線（' + step + '）', { step })),
      };
      waiter.check();
    });
  }

  async function open() {
    link = await connect();
    loggedIn = false;
    screen = '';
    utf8 = new TextDecoder('utf-8');
    link.onData(feed);
    link.onClose(() => {
      loggedIn = false;
      waiter?.closed();
    });
  }

  return {
    get loggedIn() {
      return loggedIn && !!link && !link.closed;
    },
    get userId() {
      return userId;
    },

    /** 登入。帳號後面加逗號是 PTT 的慣例，表示之後用 UTF-8。 */
    async login(id, password) {
      if (!/^[A-Za-z][A-Za-z0-9]{1,11}$/.test(String(id || ''))) throw new PttTerminalError('PTT_BAD_ID', 'PTT 帳號格式不正確');
      if (typeof password !== 'string' || !password || /[\r\n]/.test(password)) throw new PttTerminalError('PTT_BAD_PASSWORD', '沒有密碼');
      await open();
      await expect([{ name: 'welcome', match: (s) => s.includes('請輸入代號') || s.includes('guest') }], { step: '歡迎畫面', timeoutMs: 15000 });
      send(id + ',' + ENTER);
      await expect([{ name: 'password-prompt', match: (s) => /密碼/.test(s) }], { step: '密碼提示' });
      send(password + ENTER);
      const wrong = new PttTerminalError('PTT_WRONG_LOGIN', '帳號或密碼不對');
      await expect(
        [
          { name: 'main-menu', match: ['離開，再見'] },
          { name: 'wrong', match: ['密碼不對'], fail: wrong },
          { name: 'retry', match: ['請重新輸入'], fail: wrong },
          { name: 'too-often', match: ['登入太頻繁'], fail: new PttTerminalError('PTT_LOGIN_TOO_OFTEN', 'PTT 說登入太頻繁，請晚一點再試') },
          { name: 'overload', match: ['系統過載'], fail: new PttTerminalError('PTT_OVERLOAD', 'PTT 系統過載，請晚一點再試') },
          { name: 'two-factor', match: ['兩階段'], fail: new PttTerminalError('PTT_TWO_FACTOR', '這個帳號開了兩階段認證，本插件不支援') },
          { name: 'secure-only', match: ['只能使用安全連線'], fail: new PttTerminalError('PTT_SECURE_ONLY', '這個帳號設定為只能使用安全連線，目前的連線方式不被接受') },
          { name: 'reset-email', match: ['請重新設定您的聯絡信箱'], fail: new PttTerminalError('PTT_NEEDS_ATTENTION', 'PTT 要求先重新設定聯絡信箱，請用一般方式登入處理') },
          // 不踢掉其他登入的連線（你可能正用別的裝置掛在站上），也不刪登入失敗紀錄（那是給你自己看的）。
          { name: 'duplicate', match: ['您想刪除其他重複登入的連線嗎'], reply: 'n' + ENTER },
          { name: 'failed-attempts', match: ['您要刪除以上錯誤嘗試的記錄嗎'], reply: 'n' + ENTER },
          { name: 'draft', match: ['有一篇文章尚未完成'], reply: 'Q' + ENTER },
          { name: 'register', match: ['您確定要填寫註冊單嗎'], fail: new PttTerminalError('PTT_NEEDS_ATTENTION', '這個帳號還沒完成註冊，不能推文') },
          { name: 'board-list', match: (s) => s.includes('【看板列表】') || s.includes('【分類看板】'), reply: GO_MAIN },
          { name: 'any-key', match: ['任意鍵'], reply: ' ' },
        ],
        { step: '登入', timeoutMs: 30000 },
      );
      loggedIn = true;
      userId = id;
    },

    /**
     * 對一篇文章推文。回傳 { kind }（實際送出的種類）。
     * 送出前會先查文章資訊，確認游標所在的文章就是要推的那一篇。
     */
    async push({ board, articleId, kind, text }) {
      if (!this.loggedIn) throw new PttTerminalError('PTT_NOT_LOGGED_IN', '還沒登入 PTT');
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/.test(String(board || ''))) throw new PttTerminalError('PTT_BAD_BOARD', '看板名稱格式不正確');
      if (!['push', 'boo', 'arrow'].includes(kind)) throw new PttTerminalError('PTT_BAD_KIND', '推文種類不正確');
      const content = String(text || '');
      if (!content.trim() || /[\x00-\x1f\x7f]/.test(content)) throw new PttTerminalError('PTT_BAD_TEXT', '推文內容不能是空的，也不能有換行或控制字元');
      const aid = aidFromArticleId(articleId);
      if (!articleTime(articleId)) throw new PttTerminalError('PTT_BAD_ARTICLE', '文章代碼不正確');

      send(GO_MAIN + 'qs' + board + ENTER + CTRL_C.repeat(5));
      await expect(
        [
          { name: 'in-board', match: inBoard },
          { name: 'animation', match: ['互動式動畫播放中'], reply: CTRL_C.repeat(5) },
          { name: 'any-key', match: ['任意鍵'], reply: ' ' },
        ],
        { step: '進看板' },
      );

      // 跳到那篇文章並查詢游標所在文章的資訊，確認真的是這一篇。
      // （跳文章時 PTT 只重畫游標，不會重畫整個畫面，所以兩個按鍵一起送、直接等資訊畫面。）
      send('#' + aid + ENTER + 'Q');
      const info = await expect(
        [
          { name: 'info', match: (s) => s.includes('文章代碼(AID):') && s.includes('任意鍵') },
          { name: 'not-found', match: (s) => /找不到這個文章代碼|找不到文章/.test(s), fail: new PttTerminalError('PTT_ARTICLE_GONE', '在看板裡找不到這篇文章（可能已被刪除）') },
        ],
        { step: '確認文章' },
      );
      void info;
      const shown = /文章代碼\(AID\):\s*#(\S{8})\s*\(([A-Za-z0-9_-]+)\)/.exec(screen);
      if (!shown || shown[1] !== aid || shown[2].toLowerCase() !== board.toLowerCase()) {
        send(' ');
        throw new PttTerminalError('PTT_WRONG_ARTICLE', '游標不在要推的那篇文章上，為了避免推錯已中止');
      }
      send(' ' + CTRL_L);
      await expect([{ name: 'list', match: inBoard }], { step: '回到列表' });

      send('X');
      const tooFast = new PttTerminalError('PTT_TOO_FAST', 'PTT 說推文太頻繁，這次沒有送出');
      const prompt = await expect(
        [
          { name: 'options', match: ['您覺得這篇'] },
          { name: 'arrow-only', match: (s) => s.includes('→ ' + userId + ': ') || s.includes('加註方式') },
          { name: 'too-fast', match: ['禁止快速連續推文'], fail: tooFast },
          { name: 'too-many', match: ['禁止短時間內大量推文'], fail: tooFast },
          { name: 'muted', match: ['使用者不可發言'], fail: new PttTerminalError('PTT_NO_PERMISSION', '這個帳號在這個看板不能發言（可能被水桶或資格不足）') },
          { name: 'forbidden', match: ['禁止推薦'], fail: new PttTerminalError('PTT_PUSH_FORBIDDEN', '這篇文章或這個看板禁止推文') },
        ],
        { step: '推文提示' },
      );

      let actual = kind;
      let keys = '';
      if (prompt.name === 'options') {
        const line = screen.slice(screen.lastIndexOf('您覺得這篇'));
        const available = { push: line.includes('值得推薦'), boo: line.includes('給它噓聲'), arrow: line.includes('只加→註解') };
        if (!available[kind]) {
          // 只允許「推」退成「→」；不會自動變成噓，噓也不會自動變成別的。
          if (kind === 'push' && available.arrow) actual = 'arrow';
          else {
            send(CTRL_C);
            throw new PttTerminalError('PTT_KIND_UNAVAILABLE', '這篇文章現在不能用這種推文');
          }
        }
        keys = { push: '1', boo: '2', arrow: '3' }[actual];
      } else {
        if (kind === 'boo') {
          send(CTRL_C);
          throw new PttTerminalError('PTT_KIND_UNAVAILABLE', '這篇文章現在只能加 → 註解，沒有送出噓文');
        }
        actual = 'arrow';
      }
      send(keys + content + ENTER + 'y' + ENTER + CTRL_L);
      await expect([{ name: 'done', match: inBoard }], { step: '送出推文' });
      return { kind: actual };
    },

    /**
     * 回一篇文章（發一篇「Re:」到看板）。採用原標題、不用簽名檔、不存底稿；quote 決定要不要引用原文（預設引用）。
     * 和推文一樣先確認游標在正確的文章上。PTT 對這篇回文提出警告（要求「強制寫入」）時不硬送，直接中止。
     */
    async reply({ board, articleId, body, quote = true }) {
      if (!this.loggedIn) throw new PttTerminalError('PTT_NOT_LOGGED_IN', '還沒登入 PTT');
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/.test(String(board || ''))) throw new PttTerminalError('PTT_BAD_BOARD', '看板名稱格式不正確');
      const lines = wrapBody(body);
      if (!lines.length) throw new PttTerminalError('PTT_BAD_TEXT', '回文內容不能是空的');
      if (lines.some((line) => /[\x00-\x1f\x7f]/.test(line))) throw new PttTerminalError('PTT_BAD_TEXT', '回文內容不能有控制字元');
      const aid = aidFromArticleId(articleId);

      send(GO_MAIN + 'qs' + board + ENTER + CTRL_C.repeat(5));
      await expect(
        [
          { name: 'in-board', match: inBoard },
          { name: 'animation', match: ['互動式動畫播放中'], reply: CTRL_C.repeat(5) },
          { name: 'any-key', match: ['任意鍵'], reply: ' ' },
        ],
        { step: '進看板' },
      );
      const gone = new PttTerminalError('PTT_ARTICLE_GONE', '在看板裡找不到這篇文章（可能已被刪除）');
      send('#' + aid + ENTER + 'Q');
      await expect(
        [
          { name: 'info', match: (s) => s.includes('文章代碼(AID):') && s.includes('任意鍵') },
          { name: 'not-found', match: (s) => /找不到這個文章代碼|找不到文章/.test(s), fail: gone },
        ],
        { step: '確認文章' },
      );
      const shown = /文章代碼\(AID\):\s*#(\S{8})\s*\(([A-Za-z0-9_-]+)\)/.exec(screen);
      if (!shown || shown[1] !== aid || shown[2].toLowerCase() !== board.toLowerCase()) {
        send(' ');
        throw new PttTerminalError('PTT_WRONG_ARTICLE', '游標不在要回的那篇文章上，為了避免回錯已中止');
      }
      send(' ' + CTRL_L);
      await expect([{ name: 'list', match: inBoard }], { step: '回到列表' });

      // 開啟文章後按 r 回應；依序回答「回應至看板」「採用原標題」「引用原文」，直到進入編輯畫面。
      send(ENTER + 'r');
      const noReply = (message) => new PttTerminalError('PTT_REPLY_FORBIDDEN', message);
      await expect(
        [
          { name: 'editor', match: ['編輯文章'] },
          { name: 'closed-marked', match: ['不得回應'], fail: noReply('這篇文章已結案，不能回應') },
          { name: 'closed', match: ['是否真的要回應'], fail: noReply('這篇文章已結案，沒有回應') },
          { name: 'board-no-reply', match: ['不開放回覆文章'], fail: noReply('這個看板不開放回覆文章') },
          { name: 'muted', match: ['使用者不可發言'], fail: new PttTerminalError('PTT_NO_PERMISSION', '這個帳號在這個看板不能發言（可能被水桶或資格不足）') },
          { name: 'no-permission', match: ['未達看板要求權限'], fail: new PttTerminalError('PTT_NO_PERMISSION', '這個帳號還沒達到這個看板的發文門檻') },
          { name: 'reply-to', match: ['▲ 回應至'], reply: 'F' + ENTER },
          { name: 'keep-title', match: ['採用原標題'], reply: 'Y' + ENTER },
          { name: 'quote', match: ['請問要引用原文嗎'], reply: (quote ? 'Y' : 'N') + ENTER },
        ],
        { step: '準備回文' },
      );

      send(lines.join(ENTER) + ENTER + CTRL_X);
      await expect(
        [
          { name: 'save-prompt', match: ['確定要儲存檔案嗎'] },
          { name: 'warning', match: ['強制寫入'], fail: new PttTerminalError('PTT_REPLY_WARNING', 'PTT 對這篇回文提出警告（例如引言太多），沒有硬送') },
        ],
        { step: '寫回文' },
      );
      // 從這裡開始，文章可能已經發出去；之後的失敗都算「結果不確定」。
      send('s' + ENTER);
      await expect(
        [
          { name: 'done', match: ['任意鍵繼續'] },
          { name: 'warning', match: ['強制寫入'], fail: new PttTerminalError('PTT_REPLY_WARNING', 'PTT 對這篇回文提出警告（例如引言太多），沒有硬送', { step: '回文警告' }) },
          { name: 'signature', match: (s) => s.includes('請選擇簽名檔') || s.includes('x=隨機'), reply: '0' + ENTER },
          { name: 'backup', match: ['是否自存底稿'], reply: 'N' + ENTER },
        ],
        { step: '送出回文', timeoutMs: Math.max(stepTimeoutMs, 20000) },
      );
      send(' ' + CTRL_L);
      await expect([{ name: 'list', match: (s) => inBoard(s) || s.length > 0 }], { step: '回文完成', timeoutMs: 3000 }).catch(() => {});
      return { ok: true };
    },

    /**
     * 在看板發一篇新文章。不選文章分類（要分類標籤就自己寫在標題裡，例如「[閒聊] …」）、
     * 不用簽名檔；匿名看板一律用真實帳號。
     */
    async post({ board, title, body, category = '' }) {
      if (!this.loggedIn) throw new PttTerminalError('PTT_NOT_LOGGED_IN', '還沒登入 PTT');
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/.test(String(board || ''))) throw new PttTerminalError('PTT_BAD_BOARD', '看板名稱格式不正確');
      const subject = String(title || '').trim();
      const wanted = String(category || '').trim();
      const problem = titleProblem(subject, { category: wanted });
      if (problem) throw new PttTerminalError('PTT_BAD_TITLE', problem);
      const lines = wrapBody(body);
      if (!lines.length) throw new PttTerminalError('PTT_BAD_TEXT', '文章內容不能是空的');
      if (lines.some((line) => /[\x00-\x1f\x7f]/.test(line))) throw new PttTerminalError('PTT_BAD_TEXT', '文章內容不能有控制字元');

      send(GO_MAIN + 'qs' + board + ENTER + CTRL_C.repeat(5));
      await expect(
        [
          { name: 'in-board', match: inBoard },
          { name: 'animation', match: ['互動式動畫播放中'], reply: CTRL_C.repeat(5) },
          { name: 'any-key', match: ['任意鍵'], reply: ' ' },
        ],
        { step: '進看板' },
      );
      // 確認真的進到要發文的看板（發文沒有文章代碼可以核對，改核對看板名稱）。
      const where = /看板《([A-Za-z0-9_-]+)》/.exec(screen);
      if (where && where[1].toLowerCase() !== board.toLowerCase()) throw new PttTerminalError('PTT_WRONG_BOARD', '進到的不是要發文的看板，已中止');

      send(CTRL_P);
      await expect(
        [
          { name: 'compose', match: ['發表文章於【'] },
          { name: 'muted', match: ['使用者不可發言'], fail: new PttTerminalError('PTT_NO_PERMISSION', '這個帳號在這個看板不能發言（可能被水桶或資格不足）') },
          { name: 'no-permission', match: ['未達看板要求權限'], fail: new PttTerminalError('PTT_NO_PERMISSION', '這個帳號還沒達到這個看板的發文門檻') },
        ],
        { step: '準備發文' },
      );
      const composeBoard = /發表文章於【\s*([A-Za-z0-9_-]+)\s*】/.exec(screen);
      if (composeBoard && composeBoard[1].toLowerCase() !== board.toLowerCase()) {
        send(CTRL_C);
        throw new PttTerminalError('PTT_WRONG_BOARD', '發文畫面顯示的不是要發文的看板，已中止');
      }
      // 有指定分類：從畫面上列出的分類裡找名稱完全相同的那一個；找不到就中止，不會亂選。
      let categoryKey = '';
      if (wanted) {
        const options = parseCategories(screen);
        const hit = options.find((o) => o.label === wanted);
        if (!hit) {
          send(CTRL_C);
          throw new PttTerminalError('PTT_NO_CATEGORY', options.length ? `這個看板沒有「${wanted}」這個分類（有：${options.map((o) => o.label).join('、')}）` : `這個看板的發文畫面沒有列出分類，沒辦法選「${wanted}」`, { categories: options.map((o) => o.label) });
        }
        categoryKey = hit.key;
      }
      // 沒指定分類就直接按 Enter 略過；Ctrl-Y 清掉看板預設的發文範本，再寫入內文。
      send(categoryKey + ENTER + subject + ENTER + CTRL_Y.repeat(40) + lines.join(ENTER) + ENTER + CTRL_X);
      await expect([{ name: 'save-prompt', match: ['確定要儲存檔案嗎'] }], { step: '寫文章' });
      // 從這裡開始，文章可能已經發出去；之後的失敗都算「結果不確定」。
      send('s' + ENTER);
      await expect(
        [
          { name: 'done', match: ['任意鍵繼續'] },
          { name: 'warning', match: ['強制寫入'], fail: new PttTerminalError('PTT_POST_WARNING', 'PTT 對這篇文章提出警告，沒有硬送', { step: '發文警告' }) },
          { name: 'signature', match: (s) => s.includes('請選擇簽名檔') || s.includes('x=隨機'), reply: '0' + ENTER },
          { name: 'anonymous-id', match: ['請輸入你想用的ID'], reply: 'r' + ENTER },
          { name: 'backup', match: ['是否自存底稿'], reply: 'N' + ENTER },
        ],
        { step: '送出文章', timeoutMs: Math.max(stepTimeoutMs, 20000) },
      );
      send(' ' + CTRL_L);
      await expect([{ name: 'list', match: (s) => s.length > 0 }], { step: '發文完成', timeoutMs: 3000 }).catch(() => {});
      return { ok: true };
    },

    /** 正常登出並關閉連線；任何一步失敗都直接關連線。 */
    async logout() {
      if (!link) return;
      try {
        if (loggedIn && !link.closed) {
          send(GO_MAIN + 'g' + ENTER + 'y' + ENTER);
          await expect([{ name: 'bye', match: ['任意鍵'] }], { step: '登出', timeoutMs: 5000 }).catch(() => {});
        }
      } catch {}
      loggedIn = false;
      try {
        link.close();
      } catch {}
      link = null;
    },
  };
}
