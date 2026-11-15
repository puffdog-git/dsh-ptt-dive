// PTT 網頁版（www.ptt.cc/bbs）的讀取與解析。只讀、不登入、不發文。
//
// 網頁版不是官方 API：版面改了解析就可能失效，所以解析函式都是純函式、各有測試。
// 連線只會到 www.ptt.cc，不跟隨轉址；被限流或擋下時進入暫停期，期間不再發請求。

export const PTT_ORIGIN = 'https://www.ptt.cc';
export const USER_AGENT = 'dsh-ptt-dive/0.1 (+https://github.com/puffdog-git/dsh-ptt-dive; read-only reader)';
export const BOARD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/;
export const ARTICLE_PATTERN = /^[MG]\.\d{9,10}\.A\.[0-9A-F]{3}$/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lsaquo: '‹', rsaquo: '›' };

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const stripTags = (html) => decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ''));

export function validBoard(name) {
  return typeof name === 'string' && BOARD_PATTERN.test(name);
}

export function validArticleId(id) {
  return typeof id === 'string' && ARTICLE_PATTERN.test(id);
}

/** 文章 ID 內含發文時間（Unix 秒）。 */
export function articleTime(id) {
  const match = /^[MG]\.(\d{9,10})\./.exec(String(id || ''));
  return match ? Number(match[1]) * 1000 : 0;
}

/** 列表上的推文數欄位：數字、「爆」（100 以上）、「X1」～「XX」（噓多於推）。 */
export function parsePushCount(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  if (value === '爆') return 100;
  if (/^XX$/i.test(value)) return -100;
  const bad = /^X(\d)$/i.exec(value);
  if (bad) return -10 * Number(bad[1]);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 解析看板列表頁。
 * 回傳 { entries, prevPage, over18 }；置底文（分隔線之後）標成 pinned，已刪除的文章沒有連結、不列入。
 */
export function parseBoardIndex(html, board) {
  const source = String(html || '');
  if (/ask\/over18|over18-notice/.test(source) && !/class="r-ent"/.test(source))
    return { entries: [], prevPage: 0, over18: true };
  const sep = source.indexOf('class="r-list-sep"');
  const entries = [];
  const blockPattern = /<div class="r-ent">([\s\S]*?)(?=<div class="r-ent">|<div class="r-list-sep">|<div class="bbs-screen|<\/div>\s*<\/div>\s*<div id="article-polling|$)/g;
  let block;
  while ((block = blockPattern.exec(source))) {
    const body = block[1];
    const link = /<a href="\/bbs\/([A-Za-z0-9_-]+)\/([MG]\.\d+\.A\.[0-9A-F]{3})\.html">([\s\S]*?)<\/a>/.exec(body);
    if (!link || (board && link[1] !== board)) continue;
    const pick = (name) => stripTags((new RegExp('<div class="' + name + '">([\\s\\S]*?)</div>').exec(body) || [])[1]).trim();
    const title = stripTags(link[3]).trim();
    const tag = (/^(?:Re:\s*|Fw:\s*)*\[([^\]]{1,8})\]/.exec(title) || [])[1] || '';
    entries.push({
      board: link[1],
      id: link[2],
      title,
      tag,
      isReply: /^Re:/i.test(title),
      pushes: parsePushCount(pick('nrec')),
      author: pick('author'),
      date: pick('date'),
      time: articleTime(link[2]),
      pinned: sep >= 0 && block.index > sep,
      url: PTT_ORIGIN + '/bbs/' + link[1] + '/' + link[2] + '.html',
    });
  }
  const prev = /href="\/bbs\/[A-Za-z0-9_-]+\/index(\d+)\.html">(?:&lsaquo;|‹)\s*上頁/.exec(source);
  return { entries, prevPage: prev ? Number(prev[1]) : 0, over18: false };
}

const PUSH_TAGS = { 推: 'push', 噓: 'boo', '→': 'arrow' };

/**
 * 解析文章頁。
 * 回傳 { meta, body, pushes, counts, images, over18 }；內文在簽名檔／發信站之前截斷。
 */
export function parseArticle(html) {
  const source = String(html || '');
  const start = source.indexOf('id="main-content"');
  if (start < 0) return { ok: false, over18: /ask\/over18|over18-notice/.test(source), notFound: /404 - Not Found/.test(source) };
  let main = source.slice(source.indexOf('>', start) + 1);
  const end = main.search(/<div id="article-polling"|<div class="bbs-screen bbs-footer|<div id="navigation"/);
  if (end >= 0) main = main.slice(0, end);

  const meta = {};
  const names = { 作者: 'author', 看板: 'board', 標題: 'title', 時間: 'time' };
  main = main.replace(
    /<div class="article-metaline(?:-right)?"><span class="article-meta-tag">([^<]*)<\/span><span class="article-meta-value">([\s\S]*?)<\/span><\/div>/g,
    (_, tag, value) => {
      const key = names[stripTags(tag).trim()];
      if (key && !meta[key]) meta[key] = stripTags(value).trim();
      return '';
    },
  );

  const pushes = [];
  const counts = { push: 0, boo: 0, arrow: 0 };
  let pushShowsIp = false;
  main = main.replace(
    /<div class="push"><span class="[^"]*push-tag">([\s\S]*?)<\/span><span class="[^"]*push-userid">([\s\S]*?)<\/span><span class="[^"]*push-content">([\s\S]*?)<\/span><span class="push-ipdatetime">([\s\S]*?)<\/span><\/div>/g,
    (_, tag, user, content, when) => {
      const kind = PUSH_TAGS[stripTags(tag).trim()] || 'arrow';
      if (/\d{1,3}(?:\.\d{1,3}){3}/.test(when)) pushShowsIp = true;
      counts[kind] += 1;
      pushes.push({
        kind,
        user: stripTags(user).trim(),
        text: stripTags(content).replace(/^\s*:\s?/, '').trim(),
        // 有些看板這一欄帶推文者的 IP；只留日期時間。
        when: (/\d{1,2}\/\d{1,2}(?:\s+\d{2}:\d{2})?/.exec(stripTags(when)) || [''])[0],
      });
      return '';
    },
  );

  const images = [];
  for (const m of main.matchAll(/href="(https?:\/\/[^"\s]+?\.(?:png|jpe?g|gif|webp))"/gi)) {
    const url = decodeEntities(m[1]);
    if (!images.includes(url) && images.length < 20) images.push(url);
  }
  main = main.replace(/<div class="richcontent">[\s\S]*?<\/div>/g, '');

  let text = stripTags(main).replace(/\r/g, '');
  const station = text.search(/\n?※ 發信站:/);
  if (station >= 0) text = text.slice(0, station);
  text = text.replace(/\n--\s*$/, '').replace(/\n{3,}/g, '\n\n').trim();

  const authorMatch = /^(\S+)(?:\s*\((.*)\))?$/.exec(meta.author || '');
  return {
    ok: true,
    over18: false,
    meta: { ...meta, authorId: authorMatch?.[1] || '', nickname: authorMatch?.[2] || '' },
    body: text,
    pushes,
    counts,
    // 這個看板的推文會不會顯示 IP（影響一則推文能寫多長）；還沒有推文時無從判斷。
    recordsIp: pushes.length ? pushShowsIp : null,
    images,
  };
}

export class PttBlockedError extends Error {
  constructor(message, until) {
    super(message);
    this.code = 'PTT_PAUSED';
    this.until = until;
  }
}

/**
 * 建立讀取器。
 * options: fetchImpl、gapMs（請求間隔，最少 500）、over18（是否帶「已滿 18 歲」cookie）、
 *          pauseMs（被擋後暫停多久）、timeoutMs、now、sleep。
 */
export function createPttReader(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const value = (v) => (typeof v === 'function' ? v() : v);
  const settings = () => ({
    gapMs: Math.max(500, Number(value(options.gapMs)) || 1500),
    over18: !!value(options.over18),
    pauseMs: Math.max(60000, Number(options.pauseMs) || 30 * 60000),
    timeoutMs: Math.max(3000, Number(options.timeoutMs) || 15000),
  });
  const state = { pausedUntil: 0, pauseReason: '', lastAt: 0, requests: 0, failures: 0 };
  let chain = Promise.resolve();

  async function request(path, signal) {
    const { gapMs, over18, pauseMs, timeoutMs } = settings();
    if (state.pausedUntil > now())
      throw new PttBlockedError('PTT 讀取暫停中（' + state.pauseReason + '），到期前不會再發請求', state.pausedUntil);
    const wait = state.lastAt ? state.lastAt + gapMs - now() : 0;
    if (wait > 0) await sleep(wait);
    signal?.throwIfAborted();
    state.lastAt = now();
    state.requests += 1;
    const timeout = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await fetchImpl(PTT_ORIGIN + path, {
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html',
          'accept-language': 'zh-TW,zh;q=0.9',
          ...(over18 ? { cookie: 'over18=1' } : {}),
        },
      });
    } catch (error) {
      state.failures += 1;
      if (signal?.aborted) throw error;
      throw Object.assign(Error('連不上 PTT：' + (error?.name === 'TimeoutError' ? '逾時' : error?.message || error)), {
        code: 'PTT_NETWORK',
      });
    }
    if ([403, 429, 503].includes(response.status)) {
      state.pausedUntil = now() + pauseMs;
      state.pauseReason = 'HTTP ' + response.status;
      state.failures += 1;
      throw new PttBlockedError('PTT 回應 HTTP ' + response.status + '，可能被限流；已暫停讀取', state.pausedUntil);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      if (/over18/.test(location)) throw Object.assign(Error('這個看板需要確認已滿 18 歲'), { code: 'PTT_OVER18' });
      throw Object.assign(Error('PTT 轉址到其他位置，未跟隨'), { code: 'PTT_REDIRECT' });
    }
    if (response.status === 404) throw Object.assign(Error('找不到這個看板或文章'), { code: 'PTT_NOT_FOUND' });
    if (!response.ok) {
      state.failures += 1;
      throw Object.assign(Error('PTT 回應 HTTP ' + response.status), { code: 'PTT_HTTP' });
    }
    const html = await response.text();
    if (html.length > 3 * 1024 * 1024) throw Object.assign(Error('頁面超過大小上限'), { code: 'PTT_TOO_LARGE' });
    return html;
  }

  // 所有請求排成一列，確保間隔對整個插件有效（設定頁、工具、排程同時用也一樣）。
  const queued = (path, signal) => {
    const run = chain.catch(() => {}).then(() => request(path, signal));
    chain = run.catch(() => {});
    return run;
  };

  return {
    state: () => ({ ...state, paused: state.pausedUntil > now() }),
    resume() {
      state.pausedUntil = 0;
      state.pauseReason = '';
    },
    /** 讀看板列表；page 省略時是最新一頁。 */
    async listBoard(board, { page, signal } = {}) {
      if (!validBoard(board)) throw Object.assign(Error('看板名稱格式不正確'), { code: 'PTT_BAD_BOARD' });
      const p = Number(page);
      const path = '/bbs/' + board + '/index' + (Number.isInteger(p) && p > 0 ? p : '') + '.html';
      const parsed = parseBoardIndex(await queued(path, signal), board);
      if (parsed.over18) throw Object.assign(Error('這個看板需要確認已滿 18 歲'), { code: 'PTT_OVER18' });
      return parsed;
    },
    async readArticle(board, id, { signal } = {}) {
      if (!validBoard(board)) throw Object.assign(Error('看板名稱格式不正確'), { code: 'PTT_BAD_BOARD' });
      if (!validArticleId(id)) throw Object.assign(Error('文章代碼格式不正確'), { code: 'PTT_BAD_ARTICLE' });
      const parsed = parseArticle(await queued('/bbs/' + board + '/' + id + '.html', signal));
      if (!parsed.ok) {
        if (parsed.over18) throw Object.assign(Error('這個看板需要確認已滿 18 歲'), { code: 'PTT_OVER18' });
        throw Object.assign(Error('讀不到文章內容（可能已刪除或版面改了）'), { code: 'PTT_PARSE' });
      }
      return { board, id, url: PTT_ORIGIN + '/bbs/' + board + '/' + id + '.html', time: articleTime(id), ...parsed };
    },
  };
}

/** 從網址或「看板/代碼」取出看板與文章代碼。 */
export function parseArticleRef(ref) {
  const match = /(?:^|\/bbs\/|^https?:\/\/www\.ptt\.cc\/bbs\/)([A-Za-z0-9_-]+)\/([MG]\.\d+\.A\.[0-9A-F]{3})(?:\.html)?$/.exec(
    String(ref || '').trim(),
  );
  return match && validBoard(match[1]) ? { board: match[1], id: match[2] } : null;
}
