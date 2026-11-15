// 把風格庫開放給同一個 DSH 裡的其他插件（例如 Discord 賽博群友的「語氣樣本」功能）。
//
// 用一個中立的登記處：globalThis[Symbol.for('dsh.style.providers.v1')]。
// 提供者把自己登記進去，使用者在需要的當下才去取，所以兩個插件誰先載入都沒關係。
// 這個接口只讀：只回傳句子、來源看板與話題，沒有帳號，也不會觸發任何網路請求。
import { createHash } from 'node:crypto';
import { validBoard } from './ptt.js';

export const STYLE_REGISTRY = Symbol.for('dsh.style.providers.v1');
export const PROVIDER_ID = 'ptt';

function registry(root) {
  if (!root[STYLE_REGISTRY]) root[STYLE_REGISTRY] = { version: 1, providers: new Map() };
  return root[STYLE_REGISTRY];
}

/**
 * 把一句話拆成比對用的詞。中文沒有空白，所以連續的中文字拆成雙字詞（「台積電法說」→ 台積、積電、電法、法說）；
 * 英數字維持整個詞。回傳 [{ term, weight }]：英數詞權重 2，中文雙字詞權重 1。
 */
export function matchTerms(query) {
  const out = new Map();
  for (const chunk of String(query || '').toLowerCase().match(/[a-z0-9_]{2,}|[㐀-鿿]+/g) || []) {
    if (/^[a-z0-9_]/.test(chunk)) out.set(chunk, 2);
    else for (let i = 0; i + 2 <= chunk.length; i++) out.set(chunk.slice(i, i + 2), 1);
    if (out.size >= 60) break;
  }
  return [...out].map(([term, weight]) => ({ term, weight }));
}

/** 相關到什麼程度才算「話題對得上」：至少兩個中文雙字詞，或一個英數詞。 */
export const MATCH_THRESHOLD = 2;

/**
 * 從風格庫挑樣本。回傳 { samples, matched, total }：
 *   samples  [{ text, kind, source, topic }]，最相關的排前面
 *   matched  話題或句子和 query 有交集的樣本數（0 表示只是隨手挑的）
 *   total    符合來源條件的樣本總數
 */
export function pickStyleSamples(boards, { query = '', sources = [], count = 3, seed = '' } = {}) {
  const wanted = (Array.isArray(sources) ? sources : []).filter(validBoard);
  const pool = [];
  for (const [board, samples] of Object.entries(boards || {})) {
    if (wanted.length && !wanted.includes(board)) continue;
    for (const s of Array.isArray(samples) ? samples : []) if (typeof s?.text === 'string' && s.text) pool.push({ ...s, source: board });
  }
  const terms = matchTerms(query);
  const scored = pool.map((s) => {
    const hay = (String(s.topic || '') + ' ' + s.text).toLowerCase();
    const raw = terms.reduce((n, t) => n + (hay.includes(t.term) ? t.weight : 0), 0);
    // 只碰到一個雙字詞多半是巧合，不算對上話題。
    return { s, score: raw >= MATCH_THRESHOLD ? raw : 0 };
  });
  // 話題對得上的排前面。其餘的：有給 seed 就依 seed 打散（同一個 seed 每次順序相同，不同 seed 拿到不同句子），
  // 沒給就照新舊。這樣話題對不上時，不會每次都回同樣那幾句最新的。
  const key = String(seed || '');
  const mix = (text) => createHash('sha256').update(key + '|' + text).digest().readUInt32BE(0);
  scored.sort((a, b) => b.score - a.score || (key ? mix(a.s.text) - mix(b.s.text) : (b.s.at || 0) - (a.s.at || 0)));
  const limit = Math.min(12, Math.max(1, Math.round(Number(count)) || 3));
  return {
    samples: scored.slice(0, limit).map(({ s }) => ({ text: s.text, kind: s.kind, source: s.source, topic: String(s.topic || '') })),
    matched: scored.filter((x) => x.score > 0).length,
    total: pool.length,
  };
}

/** 登記成語氣樣本的提供者；回傳取消登記的函式。getBoards 每次呼叫都回傳目前的風格庫。 */
export function registerStyleProvider(getBoards, root = globalThis) {
  const provider = {
    id: PROVIDER_ID,
    name: 'PTT 鄉民用語',
    lookup: (options = {}) => pickStyleSamples(getBoards(), options),
    status: () => {
      const boards = getBoards() || {};
      const sources = Object.entries(boards)
        .map(([board, samples]) => ({ board, count: Array.isArray(samples) ? samples.length : 0 }))
        .filter((s) => s.count);
      return { name: 'PTT 鄉民用語', samples: sources.reduce((n, s) => n + s.count, 0), sources };
    },
  };
  const reg = registry(root);
  reg.providers.set(PROVIDER_ID, provider);
  return () => {
    if (reg.providers.get(PROVIDER_ID) === provider) reg.providers.delete(PROVIDER_ID);
  };
}
