// dsh-ptt-dive 設定頁。直接手寫、沒有建置步驟。
window.__ModuleLoader__.load({
  id: 'dsh-ptt-dive',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;
    const API = '/dsh-ptt-dive';

    async function api(path, body) {
      const response = await fetch(API + path, {
        credentials: 'same-origin',
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {}
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'HTTP ' + response.status);
      return payload;
    }

    const CSS = `
.ptt{--ptt-accent:var(--dsw-alias-brand-primary,#4d6bfe);--ptt-line:var(--dsw-alias-border-l2,#8b9c9a35);--ptt-soft:color-mix(in srgb,currentColor 6%,transparent);
  container-type:inline-size;color:inherit;font-size:14px;line-height:1.6;display:flex;flex-direction:column;gap:14px;min-width:0}
.ptt *{box-sizing:border-box}
.ptt h2{font-size:17px;margin:0;font-weight:650}
.ptt h3{font-size:14px;margin:0 0 6px;font-weight:650}
.ptt p{margin:0}
.ptt-muted{opacity:.68;font-size:12.5px}
.ptt-hero{border:1px solid var(--ptt-line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--ptt-soft)}
.ptt-hero-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ptt-hero-top>div{flex:1 1 200px;min-width:0}
.ptt-btn{font:inherit;color:inherit;border:1px solid var(--ptt-line);background:transparent;border-radius:8px;padding:6px 12px;cursor:pointer;white-space:nowrap}
.ptt-btn:hover:not(:disabled){background:var(--ptt-soft)}
.ptt-btn:disabled{opacity:.45;cursor:not-allowed}
.ptt-btn:focus-visible,.ptt-tab:focus-visible,.ptt-chip button:focus-visible{outline:2px solid var(--ptt-accent);outline-offset:2px}
.ptt-btn.primary{background:var(--ptt-accent);border-color:var(--ptt-accent);color:#fff;font-weight:600;padding:8px 18px}
.ptt-btn.small{padding:3px 9px;font-size:12.5px}
.ptt-progress{font-size:13px;display:flex;gap:8px;align-items:center}
.ptt-dot{width:8px;height:8px;border-radius:50%;background:var(--ptt-accent);animation:ptt-pulse 1s ease-in-out infinite}
@keyframes ptt-pulse{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.ptt-dot{animation:none}}
.ptt-warn{border:1px solid #d9892b88;background:#d9892b1a;border-radius:8px;padding:8px 12px;font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ptt-bad{border-color:#d0453f88;background:#d0453f1a}
.ptt-tabs{display:flex;gap:2px;border-bottom:1px solid var(--ptt-line);overflow-x:auto}
.ptt-tab{font:inherit;color:inherit;background:none;border:0;border-bottom:2px solid transparent;padding:7px 12px;cursor:pointer;opacity:.7;white-space:nowrap}
.ptt-tab[aria-selected=true]{opacity:1;border-bottom-color:var(--ptt-accent);font-weight:600}
.ptt-card{border:1px solid var(--ptt-line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.ptt-chips{display:flex;flex-wrap:wrap;gap:6px}
.ptt-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--ptt-line);border-radius:999px;padding:2px 4px 2px 10px;font-size:13px;font-variant-numeric:tabular-nums}
.ptt-chip button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;opacity:.6;padding:0 5px;border-radius:50%}
.ptt-chip button:hover{opacity:1}
.ptt-chip.add{padding:2px 10px;cursor:pointer;border-style:dashed;background:none;color:inherit;font:inherit;font-size:13px}
.ptt-chip.add:hover{background:var(--ptt-soft)}
.ptt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ptt-input{font:inherit;color:inherit;background:transparent;border:1px solid var(--ptt-line);border-radius:8px;padding:5px 9px;min-width:0}
.ptt-input:focus-visible{outline:2px solid var(--ptt-accent);outline-offset:1px}
.ptt-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ptt-field{display:flex;flex-direction:column;gap:3px;min-width:0}
.ptt-field>span{font-size:13px;font-weight:550}
.ptt-field .ptt-input{width:100%}
.ptt-check{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.ptt-check input{margin-top:4px;flex:none}
.ptt-option{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--ptt-line);border-radius:9px;padding:9px 11px;cursor:pointer}
.ptt-option[data-on=true]{border-color:var(--ptt-accent);background:color-mix(in srgb,var(--ptt-accent) 8%,transparent)}
.ptt-option input{margin-top:4px;flex:none}
.ptt-badge{display:inline-block;font-size:11.5px;border:1px solid var(--ptt-line);border-radius:999px;padding:0 7px;margin-left:6px;white-space:nowrap}
.ptt-badge.ok{border-color:#2f9e6b88;color:#2f9e6b}
.ptt-badge.no{border-color:#d9892b88;color:#d9892b}
.ptt-table{display:grid;grid-template-columns:1fr auto auto;gap:4px 14px;font-size:13px;font-variant-numeric:tabular-nums}
.ptt-table .head{opacity:.6;font-size:12px}
.ptt-report{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;border:1px solid var(--ptt-line);border-radius:10px;padding:12px 14px;max-height:520px;overflow:auto}
.ptt-report a{color:var(--ptt-accent)}
.ptt-push{display:flex;gap:8px;font-size:13.5px;padding:3px 0;border-bottom:1px dashed var(--ptt-line)}
.ptt-push b{flex:none;width:1.4em;text-align:center}
.ptt-push .push{color:#c9a227}.ptt-push .boo{color:#d0453f}.ptt-push .arrow{opacity:.6}
.ptt-push small{margin-left:auto;opacity:.55;flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ptt-savebar{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
`;

    const SUGGESTED = ['Gossiping', 'C_Chat', 'Stock', 'Baseball', 'NBA', 'Tech_Job', 'Lifeismoney', 'movie', 'MobileComm', 'PC_Shopping', 'car', 'joke'];
    const BOARD_OK = /^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/;
    const when = (ms) => (ms ? new Date(ms).toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
    const MEMORY_LABEL = { off: '未交付', delegated: '已放在正式會話', stored: '已寫入', partial: '部分寫入', failed: '失敗', skipped: '略過' };
    const RECEIPT_LABEL = { failed: 'memU 沒有確認寫入', pending_review: 'memU 列為待複核', rejected: '沒有送出' };

    // 把日報的 markdown 連結變成可點的連結；其餘照原文顯示。只允許 https://www.ptt.cc/ 的連結。
    function renderReport(text) {
      const out = [];
      // 標題本身常帶一組方括號（[新聞]、Re: [閒聊]），模型有時不跳脫，所以允許一層巢狀。
      const pattern = /\[((?:\\.|\[[^\]\n]{0,20}\]|[^\[\]\n\\]){1,200})\]\((https:\/\/www\.ptt\.cc\/[^\s)]{1,200})\)/g;
      let last = 0;
      let match;
      while ((match = pattern.exec(text))) {
        if (match.index > last) out.push(text.slice(last, match.index));
        out.push(h('a', { key: match.index, href: match[2], target: '_blank', rel: 'noreferrer noopener' }, match[1].replace(/\\(.)/g, '$1')));
        last = match.index + match[0].length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    }

    function NumberField({ label, hint, value, min, max, onChange }) {
      return h('label', { className: 'ptt-field' }, h('span', null, label),
        h('input', { className: 'ptt-input', type: 'number', min, max, value, onChange: (e) => onChange(e.target.value === '' ? '' : Number(e.target.value)) }),
        hint ? h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, hint) : null);
    }

    function Panel() {
      const [data, setData] = useState(null);
      const [draft, setDraft] = useState(null);
      const [tab, setTab] = useState('feed');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [busy, setBusy] = useState('');
      const [newBoard, setNewBoard] = useState('');
      const [check, setCheck] = useState(null);
      const [report, setReport] = useState(null);
      const [styleBoard, setStyleBoard] = useState('');
      const [samples, setSamples] = useState(null);
      const [customWs, setCustomWs] = useState(false);
      const [form, setForm] = useState({});
      const [edits, setEdits] = useState({});
      const [loginResult, setLoginResult] = useState(null);
      const blankForm = () => ({ ref: '', kind: 'push', text: '', board: '', title: '', quote: undefined, category: '', brief: '' });
      const [forms, setForms] = useState(() => ({ push: blankForm(), reply: blankForm(), post: blankForm() }));
      const [hints, setHints] = useState({ board: '', tags: [] });
      const dirty = useRef(false);

      const load = useCallback(async () => {
        try {
          const next = await api('/status');
          setData(next);
          setError('');
          if (!dirty.current) setDraft(next.config);
        } catch (e) {
          setError(String(e.message || e));
        }
      }, []);
      useEffect(() => { void load(); }, [load]);
      const running = !!data?.job?.running;
      useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden) void load(); }, running ? 1500 : 8000);
        return () => clearInterval(timer);
      }, [load, running]);

      const edit = (patch) => { dirty.current = true; setDraft((d) => ({ ...d, ...patch })); setNotice(''); };
      const act = async (key, fn) => {
        setBusy(key); setError(''); setNotice('');
        try { await fn(); } catch (e) { setError(String(e.message || e)); } finally { setBusy(''); }
      };
      const save = () => act('save', async () => {
        const result = await api('/config', draft);
        dirty.current = false; setDraft(result.config); setNotice('已儲存'); await load();
      });
      const openReport = (date) => act('report', async () => setReport(await api('/report?date=' + encodeURIComponent(date))));
      const openStyle = (board) => act('style', async () => { setStyleBoard(board); setSamples((await api('/style?board=' + encodeURIComponent(board))).samples); });

      if (!data || !draft) return h('div', { className: 'ptt' }, h('style', null, CSS), error ? h('div', { className: 'ptt-warn ptt-bad', role: 'alert' }, '讀不到狀態：' + error) : h('p', { className: 'ptt-muted' }, '載入中…'));

      const last = data.lastRound;
      const addBoard = (name) => {
        const board = String(name || '').trim();
        if (!BOARD_OK.test(board)) return setError('看板名稱只能是英文、數字、底線、連字號，2～12 個字');
        if (draft.boards.includes(board)) return;
        edit({ boards: [...draft.boards, board] }); setNewBoard(''); setError('');
      };
      const savedBoards = data.config.boards;
      const mem = data.memory;
      const memoryOptions = [
        { id: 'none', title: '只存成檔案', text: '日報存在本機資料夾，不交給任何記憶。', ready: true },
        { id: 'memu', title: '直接寫入 memU', text: '日報寫完後，請模型挑出最多三條重點，直接寫進 memU，並顯示 memU 回傳的記憶編號。每輪會多一次模型呼叫。', ready: mem.memuReady && mem.sessionReady, why: mem.memuReady ? (mem.sessionReady ? '' : 'DSH 會話服務未就緒') : 'memU 沒有載入' },
        { id: 'session', title: '放在正式 DSH 會話，讓記憶插件自己擷取', text: '適合會自動觀察所有會話的記憶插件。本插件不寫記憶庫，也無法確認對方有沒有入庫。memU 不會從這裡入庫，用 memU 請選上面那個。', ready: mem.sessionReady, why: mem.sessionReady ? '' : 'DSH 會話服務未就緒' },
      ];
      const customWorkspace = customWs || !(!draft.memoryWorkspace || mem.workspaces.some((w) => w.path === draft.memoryWorkspace));

      const hero = h('section', { className: 'ptt-hero' },
        h('div', { className: 'ptt-hero-top' },
          h('div', null,
            h('h2', null, '刷 PTT'),
            h('p', { className: 'ptt-muted' }, last ? `上次 ${when(last.at)}：讀了 ${last.read} 篇，風格庫多了 ${last.styleAdded} 句` : '還沒刷過。按右邊的按鈕讀一輪看看。')),
          running
            ? h('button', { className: 'ptt-btn', type: 'button', disabled: busy === 'cancel', onClick: () => act('cancel', async () => { await api('/round/cancel', {}); await load(); }) }, '取消這一輪')
            : h('button', { className: 'ptt-btn primary', type: 'button', disabled: !!busy || !savedBoards.length || data.reader.paused, title: !savedBoards.length ? '先加入看板並儲存' : data.reader.paused ? '讀取暫停中' : '', onClick: () => act('round', async () => { await api('/round', {}); await load(); }) }, '刷一輪')),
        running ? h('div', { className: 'ptt-progress', role: 'status' }, h('span', { className: 'ptt-dot' }), data.job.progress) : null,
        !running && data.lastError ? h('div', { className: 'ptt-warn ptt-bad', role: 'alert' }, '上一輪沒有完成：' + data.lastError) : null,
        data.reader.paused ? h('div', { className: 'ptt-warn', role: 'alert' }, `PTT 可能在限流（${data.reader.pauseReason}），已暫停讀取到 ${when(data.reader.pausedUntil)}。這段時間不會發任何請求。`,
          h('button', { className: 'ptt-btn small', type: 'button', onClick: () => act('resume', async () => { await api('/resume', {}); await load(); }) }, '我知道風險，現在恢復')) : null,
        h('p', { className: 'ptt-muted', 'data-push-state': data.config.pushEnabled || data.config.replyEnabled || data.config.postEnabled ? 'on' : 'off' },
          !data.config.pushEnabled && !data.config.replyEnabled && !data.config.postEnabled
            ? '讀文只用公開的網頁版，不需要帳號。推文、回文、發文功能都關閉中，不會登入、不會發文或推文。'
            : (data.config.pushEnabled
                ? (data.config.pushAutoBoards.length ? `推文已開啟：${data.config.pushAutoBoards.join('、')} 會自動送出，其他看板每一則都等你確認。` : '推文已開啟：每一則都等你在「推文」分頁按下送出。')
                : '推文關閉中。') + (data.config.replyEnabled ? ' 回文已開啟：每一篇都等你按下送出。' : '') + (data.config.postEnabled ? ' 發文已開啟：每一篇都等你按下送出。' : '')));

      const feed = h(React.Fragment, null,
        h('section', { className: 'ptt-card' },
          h('h3', null, '要刷的看板'),
          h('div', { className: 'ptt-chips' }, draft.boards.length ? draft.boards.map((b) => h('span', { className: 'ptt-chip', key: b }, b,
            h('button', { type: 'button', 'aria-label': '移除 ' + b, onClick: () => edit({ boards: draft.boards.filter((x) => x !== b) }) }, '×'))) : h('span', { className: 'ptt-muted' }, '還沒有看板')),
          h('div', { className: 'ptt-row' },
            h('input', { className: 'ptt-input', style: { flex: '1 1 140px' }, value: newBoard, placeholder: '看板英文名，例如 Soft_Job', 'aria-label': '新增看板', onChange: (e) => setNewBoard(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') addBoard(newBoard); } }),
            h('button', { className: 'ptt-btn', type: 'button', disabled: !newBoard.trim(), onClick: () => addBoard(newBoard) }, '加入'),
            h('button', { className: 'ptt-btn', type: 'button', disabled: !newBoard.trim() || busy === 'check', onClick: () => act('check', async () => { setCheck(null); setCheck(await api('/check', { board: newBoard.trim() })); }) }, busy === 'check' ? '檢查中…' : '先檢查讀不讀得到')),
          check ? h('p', { className: 'ptt-muted', role: 'status' }, `${check.board} 讀得到，最新一頁有 ${check.count} 篇。例如：${check.sample.map((s) => s.title).join('、') || '（空）'}`) : null,
          h('div', null, h('p', { className: 'ptt-muted' }, '常見看板，點一下加入：'),
            h('div', { className: 'ptt-chips', style: { marginTop: 4 } }, SUGGESTED.filter((b) => !draft.boards.includes(b)).map((b) => h('button', { className: 'ptt-chip add', type: 'button', key: b, onClick: () => addBoard(b) }, '+ ' + b)))),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', checked: draft.over18, onChange: (e) => edit({ over18: e.target.checked }) }),
            h('span', null, '我已滿 18 歲', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '八卦板（Gossiping）等看板會先問這一題。勾選後讀取時會自動回答「是」。')))),
        h('section', { className: 'ptt-card' },
          h('h3', null, '每一輪怎麼挑文章'),
          h('div', { className: 'ptt-fields' },
            h(NumberField, { label: '每個看板讀幾篇', min: 1, max: 15, value: draft.readPerRound, onChange: (v) => edit({ readPerRound: v }) }),
            h(NumberField, { label: '推文數至少', hint: '「爆」算 100。填 0 表示不限。', min: 0, max: 100, value: draft.minPush, onChange: (v) => edit({ minPush: v }) }),
            h(NumberField, { label: '只看幾小時內的文章', min: 1, max: 168, value: draft.maxAgeHours, onChange: (v) => edit({ maxAgeHours: v }) }),
            h(NumberField, { label: '每個看板往回翻幾頁', hint: '一頁約 20 篇。', min: 1, max: 5, value: draft.pagesPerBoard, onChange: (v) => edit({ pagesPerBoard: v }) })),
          h('label', { className: 'ptt-field' }, h('span', null, '關鍵字（標題有這些字的排前面）'),
            h('input', { className: 'ptt-input', value: draft.keywords.join('、'), placeholder: '用頓號或逗號分開，例如：台積電、大谷', onChange: (e) => edit({ keywords: e.target.value.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean) }) }),
            h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, '只影響順序，不會把沒命中的文章濾掉。'))),
        last ? h('section', { className: 'ptt-card' },
          h('h3', null, '上一輪結果'),
          h('div', { className: 'ptt-table' },
            h('span', { className: 'head' }, '看板'), h('span', { className: 'head' }, '列表'), h('span', { className: 'head' }, '讀了'),
            last.boards.map((b) => h(React.Fragment, { key: b.board }, h('span', null, b.board, b.error ? h('span', { className: 'ptt-muted' }, '　' + b.error) : null), h('span', null, b.listed), h('span', null, b.read)))),
          h('p', { className: 'ptt-muted' }, last.report.usedModel ? `日報由 ${last.report.model || last.report.provider || '模型'} 整理。` : `日報是標題清單，沒有經過模型整理（${last.report.reason || '原因不明'}）。`,
            last.memory.mode !== 'none' ? ` 記憶：${MEMORY_LABEL[last.memory.status] || last.memory.status}——${last.memory.detail}` : ''),
          last.memory.receipts?.length ? h('div', { 'data-memory-receipts': '' }, last.memory.receipts.map((r, i) => h('p', { className: 'ptt-muted', key: i, style: { overflowWrap: 'anywhere' } },
            (['stored', 'deduplicated'].includes(r.status) ? '✓ ' : '✗ ') + r.title + '　' + (r.ids?.length ? r.ids.join('、') : r.reason || RECEIPT_LABEL[r.status] || r.status) + (r.status === 'deduplicated' ? '（memU 已有幾乎相同的內容）' : '')))) : null,
          last.memory.workspace && last.memory.mode !== 'none' ? h('p', { className: 'ptt-muted', style: { overflowWrap: 'anywhere' } }, (last.memory.mode === 'memu' ? '寫入的工作區：' : '日報會話所在的工作區：') + last.memory.workspace) : null,
          last.pushes && (data.config.pushEnabled || data.config.replyEnabled) ? h('p', { className: 'ptt-muted', 'data-round-drafts': '' },
            `草稿：推文 ${last.pushes.created || 0} 則` + (last.pushes.created ? '' : last.pushes.reason ? `（${last.pushes.reason}）` : '') +
            (data.config.replyEnabled && data.config.replyDraftPerRound ? `；回文 ${last.pushes.replyCreated || 0} 篇` + (last.pushes.replyCreated ? '' : last.pushes.replyReason ? `（${last.pushes.replyReason}）` : '') : '') + '。到「推文」分頁看待送清單。') : null) : null);

      const reports = h('section', { className: 'ptt-card' },
        h('h3', null, '日報'),
        data.reports.length
          ? h('div', { className: 'ptt-chips' }, data.reports.map((d) => h('button', { className: 'ptt-btn small', type: 'button', key: d, 'aria-pressed': report?.date === d, style: report?.date === d ? { borderColor: 'var(--ptt-accent)' } : null, onClick: () => openReport(d) }, d)))
          : h('p', { className: 'ptt-muted' }, '還沒有日報。刷一輪之後會出現在這裡。'),
        report ? h(React.Fragment, null, h('div', { className: 'ptt-report' }, renderReport(report.report)), h('p', { className: 'ptt-muted', style: { overflowWrap: 'anywhere' } }, '檔案：' + report.file)) : null);

      const styleCounts = Object.entries(data.style);
      const style = h(React.Fragment, null,
        h('section', { className: 'ptt-card' },
          h('h3', null, '鄉民用語風格庫'),
          h('p', { className: 'ptt-muted' }, '讀到熱門文章時，把推文裡像樣的句子收起來，當成「這個板的人怎麼講話」的參考。只存句子，不存是誰說的。'),
          h('p', { className: 'ptt-muted' }, '它不會自動改變 AI 的用詞：AI 在對話裡需要時才用工具來查幾句參考。'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', checked: draft.styleEnabled, onChange: (e) => edit({ styleEnabled: e.target.checked }) }), h('span', null, '刷文時收集風格樣本')),
          h('div', { className: 'ptt-fields' },
            h(NumberField, { label: '文章推文數至少多少才收', min: 0, max: 100, value: draft.styleMinPush, onChange: (v) => edit({ styleMinPush: v }) }),
            h(NumberField, { label: '每個看板最多留幾句', hint: '滿了淘汰最舊的。', min: 5, max: 100, value: draft.stylePerBoard, onChange: (v) => edit({ stylePerBoard: v }) }))),
        h('section', { className: 'ptt-card' },
          h('h3', null, '目前收了什麼'),
          styleCounts.length
            ? h('div', { className: 'ptt-chips' }, styleCounts.map(([b, n]) => h('button', { className: 'ptt-btn small', type: 'button', key: b, style: styleBoard === b ? { borderColor: 'var(--ptt-accent)' } : null, onClick: () => openStyle(b) }, `${b}　${n} 句`)))
            : h('p', { className: 'ptt-muted' }, '還沒有樣本。讀到推文數夠多的文章才會收。'),
          samples ? (samples.length ? h('div', null, samples.map((s, i) => h('div', { className: 'ptt-push', key: i }, h('b', { className: s.kind }, s.kind === 'push' ? '推' : s.kind === 'boo' ? '噓' : '→'), h('span', null, s.text), h('small', { title: s.topic }, s.topic)))) : h('p', { className: 'ptt-muted' }, '這個看板還沒有樣本。')) : null));

      const settings = h(React.Fragment, null,
        h('section', { className: 'ptt-card' },
          h('h3', null, '每天自動刷一輪'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', checked: draft.autoEnabled, onChange: (e) => edit({ autoEnabled: e.target.checked }) }),
            h('span', null, '開啟', h('span', { className: 'ptt-muted', style: { display: 'block' } }, 'DSH 開著的時候，每天過了指定時間自動刷一輪（一天一次，台北時間）。'))),
          h('div', { className: 'ptt-fields' }, h(NumberField, { label: '幾點之後（0～23）', min: 0, max: 23, value: draft.autoHour, onChange: (v) => edit({ autoHour: v }) }))),
        h('section', { className: 'ptt-card' },
          h('h3', null, '日報要不要交給記憶'),
          memoryOptions.map((o) => h('label', { className: 'ptt-option', key: o.id, 'data-on': draft.memoryDelivery === o.id },
            h('input', { type: 'radio', name: 'ptt-memory', checked: draft.memoryDelivery === o.id, onChange: () => edit({ memoryDelivery: o.id }) }),
            h('span', null, h('strong', null, o.title), o.id === 'none' ? null : h('span', { className: 'ptt-badge ' + (o.ready ? 'ok' : 'no') }, o.ready ? '可用' : '目前不可用'),
              h('span', { className: 'ptt-muted', style: { display: 'block' } }, o.text), o.why ? h('span', { className: 'ptt-muted', style: { display: 'block' } }, '原因：' + o.why + '。選了也只會存成檔案。') : null))),
          draft.memoryDelivery !== 'none' ? h('div', { className: 'ptt-field', 'data-memory-workspace': draft.memoryDelivery },
            h('span', null, draft.memoryDelivery === 'memu' ? '寫到哪個工作區的記憶庫' : '日報會話要建在哪個工作區'),
            h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, draft.memoryDelivery === 'memu'
              ? 'memU 每個工作區各有一個記憶庫。選 Discord 的工作區，Discord 上的 AI 在那裡聊天時就讀得到這些重點。'
              : '每刷一輪，寫日報的那個會話會出現在這個工作區裡。選你平常在用的工作區，日報就會和那裡的其他會話放在一起，那個工作區的記憶插件也看得到。'),
            h('select', { className: 'ptt-input', 'aria-label': '記憶工作區', value: customWorkspace ? '__custom' : draft.memoryWorkspace, onChange: (e) => { if (e.target.value === '__custom') setCustomWs(true); else { setCustomWs(false); edit({ memoryWorkspace: e.target.value }); } } },
              mem.workspaces.map((w) => h('option', { key: w.path, value: w.kind === 'own' ? '' : w.path }, w.label)),
              h('option', { value: '__custom' }, '自己填路徑…')),
            customWorkspace ? h('input', { className: 'ptt-input', 'aria-label': '記憶工作區路徑', value: draft.memoryWorkspace, placeholder: '工作區資料夾的完整路徑（必須已存在）', onChange: (e) => edit({ memoryWorkspace: e.target.value }) }) : null,
            h('span', { className: 'ptt-muted', style: { fontWeight: 400, overflowWrap: 'anywhere' } }, '目前：' + (draft.memoryWorkspace || mem.ownWorkspace)),
            mem.workspaces.length < 2 ? h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, '還沒看到 Discord 的工作區。Discord 賽博群友在某個伺服器或私訊回覆過一次之後，這裡才會出現可選的項目。') : null,
            h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, draft.memoryDelivery === 'memu' ? '每寫一次，那個工作區會多一個「PTT 重點寫入記憶」會話。' : '每刷一輪，那個工作區會多一個「PTT 日報 · 日期」會話。要用清單以外的工作區，選「自己填路徑」貼上那個工作區資料夾的完整路徑。')) : null),
        h('section', { className: 'ptt-card' },
          h('h3', null, '日報與模型'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', checked: draft.reportUseModel, onChange: (e) => edit({ reportUseModel: e.target.checked }) }),
            h('span', null, '請模型整理日報', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '關掉的話日報只列標題與推噓數，不花模型用量。'))),
          h('p', { className: 'ptt-muted' }, data.model ? `目前會用：${data.model.provider}${data.model.model ? ' / ' + data.model.model : ''}（沒有指定時跟著 DSH 新對話的模型）` : '目前找不到可用的模型；日報會是標題清單。'),
          h('div', { className: 'ptt-fields' },
            h('label', { className: 'ptt-field' }, h('span', null, '指定模型服務（通常留空）'), h('input', { className: 'ptt-input', value: draft.modelProvider, placeholder: '例如 deepseek-account', onChange: (e) => edit({ modelProvider: e.target.value }) })),
            h('label', { className: 'ptt-field' }, h('span', null, '指定模型名稱（通常留空）'), h('input', { className: 'ptt-input', value: draft.modelName, onChange: (e) => edit({ modelName: e.target.value }) })))),
        h('section', { className: 'ptt-card' },
          h('h3', null, '其他'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', checked: draft.toolsEnabled, onChange: (e) => edit({ toolsEnabled: e.target.checked }) }),
            h('span', null, '讓 DSH 對話裡的 AI 可以查 PTT', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '提供四個唯讀工具：列看板、讀文章、讀日報、查風格樣本。'))),
          h('div', { className: 'ptt-fields' },
            h(NumberField, { label: '每次請求間隔（毫秒）', hint: '最少 500。太快容易被限流。', min: 500, max: 10000, value: draft.requestGapMs, onChange: (v) => edit({ requestGapMs: v }) }),
            h(NumberField, { label: '讀過的文章幾天內不重複', min: 1, max: 30, value: draft.dedupeDays, onChange: (v) => edit({ dedupeDays: v }) })),
          h('p', { className: 'ptt-muted', style: { overflowWrap: 'anywhere' } }, '資料位置：' + data.dataDir)));

      // ---------------------------------------------------------------- 推文 ---
      const acct = data.account;
      const pushes = data.pushes;
      const KIND = { push: '推', arrow: '→', boo: '噓' };
      const STATUS = { pending: '待送', sending: '送出中', sent: '已送出', failed: '沒送出', uncertain: '不確定有沒有送出', discarded: '已捨棄', expired: '已過期' };
      const VERIFIED = { seen: '網頁版已看到', 'not-seen': '網頁版還沒看到', unknown: '沒能到網頁版確認' };
      const widthOf = (text) => [...String(text || '')].reduce((n, ch) => n + (ch.codePointAt(0) > 0x7f ? 2 : 1), 0);
      const toggleIn = (list, value) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
      const pending = pushes.items.filter((i) => i.status === 'pending');
      const waitSeconds = Math.max(0, Math.ceil((pushes.nextAllowedAt - Date.now()) / 1000));
      const sendDraft = (item) => act('send-' + item.id, async () => {
        const local = edits[item.id];
        if (local && (local.text !== item.text || local.kind !== item.kind || (item.type === 'post' && (local.title !== item.title || local.category !== (item.category || ''))) || (item.type === 'reply' && local.quote !== (item.quote !== false))))
          await api('/pushes/update', { id: item.id, text: local.text, kind: local.kind, ...(item.type === 'post' ? { title: local.title, category: local.category } : {}), ...(item.type === 'reply' ? { quote: local.quote } : {}) });
        try { await api('/pushes/send', { id: item.id }); setNotice('已送出'); } finally { setEdits((e) => { const next = { ...e }; delete next[item.id]; return next; }); await load(); }
      });
      // 推文、回文、發文各一個分頁；帳號、可用的看板、間隔、說話方式、禁用詞是三者共用的，放在推文分頁。
      const cfg = data.config;
      const typeOfItem = (i) => (i.type === 'reply' ? 'reply' : i.type === 'post' ? 'post' : 'push');
      const TYPE_LABEL = { push: '推文', reply: '回文', post: '發文' };
      const TYPE_ON = { push: cfg.pushEnabled, reply: cfg.replyEnabled, post: cfg.postEnabled };
      const TYPE_QUOTA = { push: [pushes.sentToday, pushes.perDay], reply: [pushes.repliesToday, pushes.replyPerDay], post: [pushes.postsToday, pushes.postPerDay] };
      const setForm2 = (type, patch) => setForms((f) => ({ ...f, [type]: { ...f[type], ...patch } }));
      const linkStyle = { color: 'var(--ptt-accent)' };

      const riskNote = (what) => h('div', { className: 'ptt-warn', role: 'note' }, h('span', null,
        h('strong', null, `這一頁會用你的 PTT 帳號對外${what}。`), ' 有些看板不接受 AI 寫的內容（例如股板板主公告「本板是真人討論區」），被檢舉可能遭水桶或停權，後果由帳號擁有人承擔。開啟前請先看過該看板的板規。'));

      // 回文與發文分頁上的提醒：帳號與看板在推文分頁設定。
      const sharedNote = (type) => h('div', { className: 'ptt-card', 'data-shared-note': type, style: { gap: 6 } },
        h('p', { className: 'ptt-muted' }, `${TYPE_LABEL[type]}和推文共用同一個 PTT 帳號、可用的看板、兩則之間的間隔、說話方式與禁用詞。`),
        h('p', { className: 'ptt-muted' },
          acct.hasPassword ? `帳號：${acct.id}。` : '還沒設定 PTT 帳號。',
          cfg.pushBoards.length ? ` 可用的看板：${cfg.pushBoards.join('、')}。` : ' 還沒勾選可用的看板。'),
        h('div', { className: 'ptt-row' }, h('button', { className: 'ptt-btn small', type: 'button', 'data-goto-push': '', onClick: () => setTab('push') }, '到「推文」分頁設定帳號與看板')));

      const manualCard = (type) => {
        const f = forms[type];
        const set = (patch) => setForm2(type, patch);
        const isPost = type === 'post';
        const isReply = type === 'reply';
        const titleRoom = Math.floor((44 - (f.category.trim() ? widthOf(f.category.trim()) + 3 : 0)) / 2);
        const canAdd = !busy && f.text.trim() && (isPost ? f.board && f.title.trim() : f.ref.trim());
        const create = () => act('create', async () => {
          await api('/pushes/create', isPost
            ? { type: 'post', board: f.board, title: f.title, text: f.text, category: f.category.trim() }
            : { type, ref: f.ref.trim(), kind: f.kind, text: f.text, ...(isReply ? { quote: f.quote ?? cfg.replyQuote } : {}) });
          set({ ref: '', text: '', title: '', brief: '' }); setNotice('已加入待送清單'); await load();
        });
        return h('section', { className: 'ptt-card', 'data-manual': type },
          h('h3', null, isPost ? '寫一篇新文章' : isReply ? '自己新增一篇回文' : '自己新增一則推文'),
          h('p', { className: 'ptt-muted' }, isPost
            ? '選看板，自己寫標題與內文，或先寫幾句方向再請 AI 擬稿。加入後會出現在下面的待送清單，按「送出」才會發。'
            : '貼上文章網址，自己寫內容，或請 AI 擬稿後再改。加入後會出現在下面的待送清單，按「送出」才會送。'),
          isPost
            ? h(React.Fragment, null,
                h('div', { className: 'ptt-row' },
                  h('span', null, '看板'),
                  h('select', { className: 'ptt-input', 'aria-label': '發文的看板', value: f.board, onChange: (e) => {
                    const board = e.target.value;
                    set({ board });
                    setHints({ board, tags: [] });
                    // 到網頁版看這個看板最近的標題常用哪些分類標籤，當成提示（只讀）。
                    if (board) api('/pushes/categories?board=' + encodeURIComponent(board)).then((r) => setHints({ board, tags: r.tags || [] })).catch(() => {});
                  } }, h('option', { value: '' }, '選看板…'), cfg.pushBoards.map((b) => h('option', { key: b, value: b }, b)))),
                h('div', { className: 'ptt-field', 'data-post-category': '' },
                  h('span', null, '文章分類（選填）'),
                  h('div', { className: 'ptt-row' },
                    h('input', { className: 'ptt-input', 'aria-label': '文章分類', style: { width: 110 }, value: f.category, placeholder: '例如：閒聊', onChange: (e) => set({ category: e.target.value }) }),
                    hints.board === f.board && hints.tags.length ? hints.tags.map((t) => h('button', { className: 'ptt-chip add', type: 'button', key: t, 'data-category-hint': t, onClick: () => set({ category: t }) }, t)) : null),
                  h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, '填了的話，發文時會在 PTT 的分類選單裡選這一個，標題前面自動加上「[分類]」。留空就不選分類（要的話自己寫在標題裡）。' +
                    (hints.board === f.board && hints.tags.length ? '上面是這個看板最近的標題裡常見的標籤，只是參考；' : '') + 'PTT 實際有哪些分類登入後才看得到，名稱對不上時會中止、不會發出去。')),
                h('div', { className: 'ptt-field', 'data-post-brief': '' },
                  h('span', null, '想寫什麼（給 AI 擬稿用，選填）'),
                  h('textarea', { className: 'ptt-input', 'aria-label': '想寫什麼', rows: 3, style: { width: '100%' }, value: f.brief, placeholder: '用幾句話說你想寫的內容與重點。AI 只會照你寫的方向擬，不會自己補事實。', onChange: (e) => set({ brief: e.target.value }) }),
                  h('div', { className: 'ptt-row' },
                    h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, '擬好會填進下面的標題與內文，請看過、改過再加入。有些看板不接受 AI 寫的文章。'),
                    h('span', { style: { marginLeft: 'auto' } }),
                    h('button', { className: 'ptt-btn small', type: 'button', 'data-post-suggest': '', disabled: !!busy || !f.board || [...f.brief.trim()].length < 6, onClick: () => act('suggest', async () => {
                      const r = await api('/pushes/suggest', { type: 'post', board: f.board, brief: f.brief, category: f.category });
                      set({ title: r.title, text: r.text }); setNotice('AI 擬好了，請看過再決定要不要加入');
                    }) }, busy === 'suggest' ? 'AI 擬稿中…' : '請 AI 擬稿'))),
                h('input', { className: 'ptt-input', 'aria-label': '新文章標題', style: { width: '100%' }, value: f.title, placeholder: f.category.trim() ? '標題（不用再寫分類）' : '標題，例如：[閒聊] …', onChange: (e) => set({ title: e.target.value }) }))
            : h('input', { className: 'ptt-input', 'aria-label': '文章網址', style: { width: '100%' }, value: f.ref, placeholder: 'https://www.ptt.cc/bbs/看板/M.….html', onChange: (e) => set({ ref: e.target.value }) }),
          isReply ? h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', 'aria-label': '引用原文', checked: f.quote ?? cfg.replyQuote, onChange: (e) => set({ quote: e.target.checked }) }), h('span', null, '引用原文')) : null,
          type === 'push'
            ? h('div', { className: 'ptt-row' },
                h('select', { className: 'ptt-input', 'aria-label': '新增的推文種類', value: f.kind, onChange: (e) => set({ kind: e.target.value }) },
                  h('option', { value: 'push' }, '推'), h('option', { value: 'arrow' }, '→'), cfg.pushAllowBoo ? h('option', { value: 'boo' }, '噓') : null),
                h('input', { className: 'ptt-input', 'aria-label': '新增的推文內容', style: { flex: '1 1 200px' }, value: f.text, placeholder: '推文內容（單行）', onChange: (e) => set({ text: e.target.value }) }))
            : h('textarea', { className: 'ptt-input', 'aria-label': isPost ? '新文章內容' : '回文內容', rows: 8, style: { width: '100%' }, value: f.text, placeholder: isPost ? '文章內文' : '回文的內文（不用寫標題，會沿用原標題）', onChange: (e) => set({ text: e.target.value }) }),
          h('div', { className: 'ptt-row' },
            h('span', { className: 'ptt-muted' }, type === 'push' ? `${Math.ceil(widthOf(f.text.trim()) / 2)} 個全形字` : `${[...f.text.replace(/\s/g, '')].length} 個字（20～2000）` + (isPost ? `；標題 ${Math.ceil(widthOf(f.title.trim()) / 2)}／${titleRoom}` : '')),
            h('span', { style: { marginLeft: 'auto' } }),
            isPost ? null : h('button', { className: 'ptt-btn small', type: 'button', disabled: !!busy || !f.ref.trim(), onClick: () => act('suggest', async () => { const r = await api('/pushes/suggest', { type, ref: f.ref.trim() }); set({ text: r.text, kind: r.kind || f.kind }); setNotice('AI 擬好了，請看過再決定要不要加入'); }) }, busy === 'suggest' ? 'AI 擬稿中…' : '請 AI 擬稿'),
            h('button', { className: 'ptt-btn small primary', type: 'button', disabled: !canAdd, onClick: create }, busy === 'create' ? '加入中…' : '加入待送清單')),
          !TYPE_ON[type] ? h('p', { className: 'ptt-muted' }, `要先在上面開啟${TYPE_LABEL[type]}並儲存。`) : null);
      };

      const draftCard = (item) => {
        const local = edits[item.id] || { text: item.text, kind: item.kind, title: item.title, quote: item.quote !== false, category: item.category || '' };
        const isPost = item.type === 'post';
        const isLong = item.type === 'reply' || isPost; // 兩種都是多行內文
        const cols = widthOf(local.text.trim());
        const chars = [...local.text.replace(/\s/g, '')].length;
        const titleCols = widthOf(String(local.title || '').trim());
        const titleRoom = 44 - (isPost && String(local.category || '').trim() ? widthOf(String(local.category).trim()) + 3 : 0);
        const over = isLong ? chars < 20 || chars > 2000 || (isPost && (titleCols > titleRoom || titleCols < 2)) : cols > item.limit;
        const setLocal = (patch) => setEdits((e) => ({ ...e, [item.id]: { ...local, ...patch } }));
        return h('div', { className: 'ptt-card', key: item.id, 'data-draft': item.id, 'data-draft-type': typeOfItem(item), style: { gap: 6 } },
          h('p', { style: { overflowWrap: 'anywhere' } }, h('strong', null, item.board), '　', isPost ? null : h('a', { href: item.url, target: '_blank', rel: 'noreferrer noopener', style: linkStyle }, item.title),
            item.manual ? h('span', { className: 'ptt-badge' }, '自己新增') : h('span', { className: 'ptt-badge' }, 'AI 擬稿'), item.auto ? h('span', { className: 'ptt-badge no' }, '自動') : null),
          isPost ? h('div', { className: 'ptt-row' }, h('span', { className: 'ptt-muted' }, '分類'), h('input', { className: 'ptt-input', 'aria-label': '草稿的文章分類', style: { width: 110 }, value: local.category, placeholder: '不選', onChange: (e) => setLocal({ category: e.target.value }) })) : null,
          isPost ? h('input', { className: 'ptt-input', 'aria-label': '文章標題', style: { width: '100%' }, value: local.title, onChange: (e) => setLocal({ title: e.target.value }) }) : null,
          item.type === 'reply' ? h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', 'aria-label': '這篇引用原文', checked: local.quote, onChange: (e) => setLocal({ quote: e.target.checked }) }), h('span', null, '引用原文')) : null,
          isLong
            ? h('textarea', { className: 'ptt-input', 'aria-label': isPost ? '文章內容' : '回文內容', rows: 8, style: { width: '100%' }, value: local.text, onChange: (e) => setLocal({ text: e.target.value }) })
            : h('div', { className: 'ptt-row' },
                h('select', { className: 'ptt-input', 'aria-label': '推文種類', value: local.kind, onChange: (e) => setLocal({ kind: e.target.value }) },
                  h('option', { value: 'push' }, '推'), h('option', { value: 'arrow' }, '→'), cfg.pushAllowBoo ? h('option', { value: 'boo' }, '噓') : null),
                h('input', { className: 'ptt-input', 'aria-label': '推文內容', style: { flex: '1 1 200px' }, value: local.text, onChange: (e) => setLocal({ text: e.target.value }) })),
          h('div', { className: 'ptt-row' },
            h('span', { className: 'ptt-muted', style: over ? { color: '#d0453f', opacity: 1 } : null }, isPost ? `${chars} 個字（20～2000）；標題 ${Math.ceil(titleCols / 2)}／${Math.floor(titleRoom / 2)}` + (over ? '，長度不合' : '') : isLong ? `${chars} 個字（20～2000）；會沿用原標題` + (local.quote ? '並引用原文' : '，不引用原文') + (over ? '，長度不合' : '') : `${Math.ceil(cols / 2)}／${Math.floor(item.limit / 2)} 個全形字` + (over ? '，太長了' : '')),
            item.error ? h('span', { className: 'ptt-muted' }, item.error) : null,
            h('span', { style: { marginLeft: 'auto' } }),
            h('button', { className: 'ptt-btn small', type: 'button', disabled: !!busy, onClick: () => act('discard-' + item.id, async () => { await api('/pushes/discard', { id: item.id }); await load(); }) }, '捨棄'),
            h('button', { className: 'ptt-btn small primary', type: 'button', disabled: !!busy || over || !local.text.trim() || pushes.busy || !acct.hasPassword, onClick: () => sendDraft(item) }, busy === 'send-' + item.id ? '送出中…' : '送出')));
      };

      const pendingCard = (type) => {
        const list = pending.filter((i) => typeOfItem(i) === type);
        const [used, max] = TYPE_QUOTA[type];
        const empty = !TYPE_ON[type]
          ? `${TYPE_LABEL[type]}功能還沒開啟。`
          : type === 'push' ? '目前沒有待送的草稿。刷一輪之後，AI 有想說的才會出現在這裡。'
          : type === 'reply' ? '目前沒有待送的回文。可以在上面自己新增' + (cfg.replyDraftPerRound ? '，或等下一輪 AI 擬稿。' : '。')
          : '目前沒有待送的文章。可以在上面寫一篇。';
        return h('section', { className: 'ptt-card', 'data-pending': type },
          h('h3', null, `待送清單（今天已送 ${used}／${max}）`),
          waitSeconds > 0 ? h('p', { className: 'ptt-muted' }, `距離上一則還要再等 ${waitSeconds} 秒才能送下一則（推文、回文、發文共用間隔）。`) : null,
          type === 'push' && pushes.autoRunning ? h('p', { className: 'ptt-muted', role: 'status' }, '正在依間隔自動送出標了「自動」的草稿。') : null,
          list.length ? list.map(draftCard) : h('p', { className: 'ptt-muted' }, empty));
      };

      const historyCard = (type) => {
        const list = pushes.items.filter((i) => i.status !== 'pending' && typeOfItem(i) === type).slice(0, 20);
        if (!list.length) return null;
        return h('section', { className: 'ptt-card', 'data-history': type },
          h('h3', null, '最近的紀錄'),
          list.map((item) => h('div', { className: 'ptt-push', key: item.id, style: { flexWrap: 'wrap' } },
            type === 'push' ? h('b', { className: item.actualKind || item.kind }, KIND[item.actualKind || item.kind]) : null,
            h('span', { style: { overflowWrap: 'anywhere' } }, type === 'push' ? item.text : item.title + '：' + item.text.replace(/\s+/g, ' ').slice(0, 60) + (item.text.length > 60 ? '…' : ''),
              item.replyUrl ? h('a', { href: item.replyUrl, target: '_blank', rel: 'noreferrer noopener', style: { ...linkStyle, marginLeft: 6 } }, type === 'post' ? '看文章' : '看回文') : null),
            h('small', { title: item.title, style: { maxWidth: '100%', whiteSpace: 'normal', flex: '1 1 100%', marginLeft: 0 } },
              `${item.board}・${STATUS[item.status] || item.status}` + (item.sentAt && ['sent', 'uncertain'].includes(item.status) ? '・' + when(item.sentAt) : '') + (item.verified ? '・' + VERIFIED[item.verified] : '') + (item.error && item.status !== 'sent' ? '・' + item.error : '')))));
      };

      const accountCard = h('section', { className: 'ptt-card', 'data-push-account': '' },
        h('h3', null, 'PTT 帳號（推文、回文、發文共用）'),
        h('p', { className: 'ptt-muted' }, acct.hasPassword
          ? `已保存帳號 ${acct.id}。` + (acct.persistent ? '密碼用 Windows 的加密功能保存在這台電腦，只有你的 Windows 帳號解得開。' : '這個系統不支援加密保存，密碼只留在記憶體，DSH 重啟後要重新輸入。')
          : '還沒設定。密碼只會用來登入 PTT，存進去之後不會再顯示，也不會交給 AI。'),
        acct.error ? h('div', { className: 'ptt-warn ptt-bad', role: 'alert' }, acct.error) : null,
        h('div', { className: 'ptt-fields' },
          h('label', { className: 'ptt-field' }, h('span', null, '帳號'), h('input', { className: 'ptt-input', 'aria-label': 'PTT 帳號', autoComplete: 'off', value: form.id ?? acct.id, onChange: (e) => setForm((f) => ({ ...f, id: e.target.value })) })),
          h('label', { className: 'ptt-field' }, h('span', null, '密碼'), h('input', { className: 'ptt-input', 'aria-label': 'PTT 密碼', type: 'password', autoComplete: 'new-password', value: form.password || '', placeholder: acct.hasPassword ? '已保存；要換密碼才需要填' : '', onChange: (e) => setForm((f) => ({ ...f, password: e.target.value })) }))),
        h('div', { className: 'ptt-row' },
          h('button', { className: 'ptt-btn', type: 'button', disabled: busy === 'account' || !(form.id ?? acct.id) || (!form.password && !(acct.hasPassword && (form.id ?? acct.id) === acct.id)), onClick: () => act('account', async () => { await api('/account', { id: (form.id ?? acct.id).trim(), password: form.password || '' }); setForm({}); setLoginResult(null); setNotice('帳號已保存'); await load(); }) }, busy === 'account' ? '保存中…' : '保存帳號'),
          h('button', { className: 'ptt-btn', type: 'button', disabled: !acct.hasPassword || busy === 'login' || pushes.busy, onClick: () => act('login', async () => { setLoginResult(null); try { setLoginResult(await api('/account/test', {})); } catch (e) { setLoginResult({ ok: false, error: String(e.message || e) }); } }) }, busy === 'login' ? '登入測試中…' : '測試登入'),
          h('button', { className: 'ptt-btn', type: 'button', disabled: !acct.id || busy === 'clear', onClick: () => act('clear', async () => { await api('/account/clear', {}); setForm({}); setLoginResult(null); await load(); }) }, '清除帳號')),
        loginResult ? h('p', { className: 'ptt-muted', role: 'status', 'data-login-result': loginResult.ok ? 'ok' : 'fail' }, loginResult.ok ? `登入成功（${loginResult.id}），已經登出。` : '登入沒有成功：' + loginResult.error) : h('p', { className: 'ptt-muted' }, '「測試登入」只會登入後立刻登出，不會推文。'));

      const sharedCard = h('section', { className: 'ptt-card', 'data-shared-settings': '' },
        h('h3', null, '共用設定（推文、回文、發文都適用）'),
        h('div', { className: 'ptt-field' }, h('span', null, '哪些看板可以推文、回文、發文'),
          savedBoards.length ? h('div', { className: 'ptt-chips' }, savedBoards.map((b) => h('label', { className: 'ptt-chip', key: b, style: { cursor: 'pointer', paddingRight: 10 } },
            h('input', { type: 'checkbox', checked: draft.pushBoards.includes(b), onChange: () => edit({ pushBoards: toggleIn(draft.pushBoards, b), pushAutoBoards: draft.pushAutoBoards.filter((x) => x !== b) }) }), b))) : h('span', { className: 'ptt-muted' }, '先在「刷文」分頁加入看板並儲存。'),
          draft.pushBoards.includes('Stock') ? h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, '提醒：股板板主公告過 AI 內容的處理原則，在這裡用 AI 擬的內容有被處理的風險。') : null),
        h('div', { className: 'ptt-fields' },
          h(NumberField, { label: '兩則之間至少隔幾秒', hint: '最少 60。推文、回文、發文共用。', min: 60, max: 3600, value: draft.pushGapSeconds, onChange: (v) => edit({ pushGapSeconds: v }) })),
        h('label', { className: 'ptt-field' }, h('span', null, '說話方式（選填）'),
          h('textarea', { className: 'ptt-input', rows: 3, value: draft.pushPersona, placeholder: '例如：講話簡短、偶爾吐槽、不談政治', onChange: (e) => edit({ pushPersona: e.target.value }) })),
        h('label', { className: 'ptt-field' }, h('span', null, '禁用詞（出現就不送）'),
          h('input', { className: 'ptt-input', value: draft.pushBlockWords.join('、'), placeholder: '用頓號或逗號分開', onChange: (e) => edit({ pushBlockWords: e.target.value.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean) }) })));

      const pushTab = h(React.Fragment, null,
        riskNote('推文'),
        accountCard,
        sharedCard,
        h('section', { className: 'ptt-card', 'data-settings': 'push' },
          h('h3', null, '推文設定'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', 'data-push-toggle': '', checked: draft.pushEnabled, onChange: (e) => edit({ pushEnabled: e.target.checked }) }),
            h('span', null, '開啟推文', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '每刷一輪，AI 會從讀到的文章裡挑幾篇擬推文草稿，放進下面的待送清單。'))),
          draft.pushBoards.length ? h('div', { className: 'ptt-field' }, h('span', null, '哪些看板的推文不用我確認、直接送出'),
            h('span', { className: 'ptt-muted', style: { fontWeight: 400 } }, '預設都不勾：每一則都等你按「送出」。勾了的看板，AI 擬好就會依限額自動送，你事先看不到內容。只有推文有這個選項，回文與發文永遠要確認。'),
            h('div', { className: 'ptt-chips' }, draft.pushBoards.map((b) => h('label', { className: 'ptt-chip', key: b, style: { cursor: 'pointer', paddingRight: 10 } },
              h('input', { type: 'checkbox', checked: draft.pushAutoBoards.includes(b), onChange: () => edit({ pushAutoBoards: toggleIn(draft.pushAutoBoards, b) }) }), b)))) : null,
          h('div', { className: 'ptt-fields' },
            h(NumberField, { label: '每一輪最多擬幾則', min: 0, max: 5, value: draft.pushPerRound, onChange: (v) => edit({ pushPerRound: v }) }),
            h(NumberField, { label: '每天最多送幾則', min: 1, max: 30, value: draft.pushPerDay, onChange: (v) => edit({ pushPerDay: v }) })),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', checked: draft.pushAllowBoo, onChange: (e) => edit({ pushAllowBoo: e.target.checked }) }), h('span', null, '允許噓文', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '預設只有「推」和「→」。'))),
          h('p', { className: 'ptt-muted' }, '每篇文章只會推一次；草稿放超過 12 小時自動作廢；送出失敗不會自動重試。')),
        manualCard('push'),
        pendingCard('push'),
        historyCard('push'));

      const replyTab = h(React.Fragment, null,
        riskNote('回文'),
        h('section', { className: 'ptt-card', 'data-settings': 'reply' },
          h('h3', null, '回文設定'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', 'data-reply-toggle': '', checked: draft.replyEnabled, onChange: (e) => edit({ replyEnabled: e.target.checked }) }),
            h('span', null, '開啟回文', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '回文是用你的帳號在看板發一篇完整的「Re:」文章，影響比推文大。回文永遠要你按「送出」，不會自動送。'))),
          h('div', { className: 'ptt-fields' },
            h(NumberField, { label: '每天最多回幾篇', min: 1, max: 5, value: draft.replyPerDay, onChange: (v) => edit({ replyPerDay: v }) }),
            h(NumberField, { label: '每一輪讓 AI 擬幾篇回文', hint: '0 表示不擬。擬好的放進待送清單，一樣要你按送出。', min: 0, max: 2, value: draft.replyDraftPerRound, onChange: (v) => edit({ replyDraftPerRound: v }) })),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', 'data-reply-quote': '', checked: draft.replyQuote, onChange: (e) => edit({ replyQuote: e.target.checked }) }),
            h('span', null, '回文預設引用原文', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '每一篇草稿上還可以個別改。'))),
          h('p', { className: 'ptt-muted' }, '每篇文章只會回一次；沿用原標題、不加簽名檔；PTT 對回文提出警告時不硬送。')),
        sharedNote('reply'),
        manualCard('reply'),
        pendingCard('reply'),
        historyCard('reply'));

      const postTab = h(React.Fragment, null,
        riskNote('發文'),
        h('section', { className: 'ptt-card', 'data-settings': 'post' },
          h('h3', null, '發文設定'),
          h('label', { className: 'ptt-check' }, h('input', { type: 'checkbox', 'data-post-toggle': '', checked: draft.postEnabled, onChange: (e) => edit({ postEnabled: e.target.checked }) }),
            h('span', null, '開啟發新文章', h('span', { className: 'ptt-muted', style: { display: 'block' } }, '用你的帳號在看板發一篇新文章。可以自己寫，也可以先寫幾句方向再請 AI 擬稿；不論哪一種都要你按「送出」，不會自動發。'))),
          h('div', { className: 'ptt-fields' }, h(NumberField, { label: '每天最多發幾篇', min: 1, max: 3, value: draft.postPerDay, onChange: (v) => edit({ postPerDay: v }) })),
          h('p', { className: 'ptt-muted' }, '會清掉看板預設的發文範本，不加簽名檔；匿名看板一律用真實帳號。')),
        sharedNote('post'),
        manualCard('post'),
        pendingCard('post'),
        historyCard('post'));

      const tabs = [['feed', '刷文'], ['reports', '日報'], ['style', '風格庫'], ['push', '推文'], ['reply', '回文'], ['post', '發文'], ['settings', '自動與記憶']];
      const pendingCount = { push: 0, reply: 0, post: 0 };
      for (const i of pending) pendingCount[typeOfItem(i)] += 1;
      return h('div', { className: 'ptt' }, h('style', null, CSS), hero,
        error ? h('div', { className: 'ptt-warn ptt-bad', role: 'alert' }, error) : null,
        h('div', { className: 'ptt-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { className: 'ptt-tab', type: 'button', role: 'tab', key: id, 'aria-selected': tab === id, 'data-tab': id, onClick: () => setTab(id) },
          label, pendingCount[id] ? h('span', { className: 'ptt-badge', 'data-tab-count': id, style: { marginLeft: 4 } }, pendingCount[id]) : null))),
        tab === 'feed' ? feed : tab === 'reports' ? reports : tab === 'style' ? style : tab === 'push' ? pushTab : tab === 'reply' ? replyTab : tab === 'post' ? postTab : settings,
        tab !== 'reports' ? h('div', { className: 'ptt-savebar' }, notice ? h('span', { className: 'ptt-muted', role: 'status' }, notice) : dirty.current ? h('span', { className: 'ptt-muted' }, '有還沒儲存的變更') : null,
          h('button', { className: 'ptt-btn primary', type: 'button', disabled: !dirty.current || busy === 'save', onClick: save }, busy === 'save' ? '儲存中…' : '儲存')) : null);
    }

    function Row(props) {
      return props?.view === 'summary' ? h('p', null, '刷 PTT：讀看板、寫日報、收鄉民用語；推文可選（預設關閉）。') : h(Panel);
    }

    return {
      inject: ['slots'],
      PttDivePanel: Panel,
      apply(ctx) {
        ctx.slots.inject('settings.section', () => {
          ctx.effect(() => ctx.slots.register({ name: 'settings.section', id: 'dsh-ptt-dive', order: 62, label: () => '刷 PTT' }, Row));
        });
      },
    };
  },
});
