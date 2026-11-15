// 測試用的假 PTT 頁面（照網頁版的結構手寫，沒有真人的文章或帳號）。
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const NOW = Date.UTC(2026, 10, 15, 12, 0, 0); // 台北時間 2026-11-15 20:00
export const idAt = (hoursAgo, suffix = 'AAA') => `M.${Math.floor((NOW - hoursAgo * 3600000) / 1000)}.A.${suffix}`;

export function entryHtml({ board = 'Test', id, title, nrec = '', author = 'user1', deleted = false }) {
  const titleHtml = deleted ? '(本文已被刪除) [user9]' : `<a href="/bbs/${board}/${id}.html">${title}</a>`;
  return `
		<div class="r-ent">
			<div class="nrec">${nrec ? `<span class="hl f2">${nrec}</span>` : ''}</div>
			<div class="title">
			${titleHtml}
			</div>
			<div class="meta">
				<div class="author">${author}</div>
				<div class="article-menu"><div class="trigger">&#x22ef;</div></div>
				<div class="date">11/15</div>
				<div class="mark"></div>
			</div>
		</div>`;
}

export function indexHtml({ board = 'Test', entries = [], pinned = [], prev = 100 }) {
  return `<html><body><div id="action-bar-container"><div class="btn-group btn-group-paging">
<a class="btn wide" href="/bbs/${board}/index1.html">最舊</a>
${prev ? `<a class="btn wide" href="/bbs/${board}/index${prev}.html">&lsaquo; 上頁</a>` : '<a class="btn wide disabled">&lsaquo; 上頁</a>'}
<a class="btn wide disabled">下頁 &rsaquo;</a></div></div>
<div class="r-list-container action-bar-margin bbs-screen">
${entries.map((e) => entryHtml({ board, ...e })).join('')}
${pinned.length ? '<div class="r-list-sep"></div>' + pinned.map((e) => entryHtml({ board, ...e })).join('') : ''}
</div></body></html>`;
}

const PUSH_CLASS = { 推: 'hl push-tag', 噓: 'f1 hl push-tag', '→': 'f1 hl push-tag' };
export function articleHtml({ board = 'Test', title = '[閒聊] 測試文章', author = 'user1 (暱稱)', body = '內文第一行\n內文第二行', pushes = [], withIp = false }) {
  const meta = (tag, value, right = '') =>
    `<div class="article-metaline${right}"><span class="article-meta-tag">${tag}</span><span class="article-meta-value">${value}</span></div>`;
  return `<html><body><div id="main-container">
    <div id="main-content" class="bbs-screen bbs-content">${meta('作者', author)}${meta('看板', board, '-right')}${meta('標題', title)}${meta('時間', 'Sun Nov 15 20:00:00 2026')}
${body}

--
<span class="f2">※ 發信站: 批踢踢實業坊(ptt.cc), 來自: 203.0.113.7 (臺灣)
</span><span class="f2">※ 文章網址: <a href="https://www.ptt.cc/bbs/${board}/M.1.A.AAA.html">https://www.ptt.cc/bbs/${board}/M.1.A.AAA.html</a>
</span>${pushes
    .map(
      ([tag, user, text]) =>
        `<div class="push"><span class="${PUSH_CLASS[tag]}">${tag} </span><span class="f3 hl push-userid">${user}</span><span class="f3 push-content">: ${text}</span><span class="push-ipdatetime"> ${withIp ? '203.0.113.9 ' : ''}11/15 20:05\n</span></div>`,
    )
    .join('')}</div>
    <div id="article-polling" data-pollurl="/poll"></div></div></body></html>`;
}

/** 假的 fetch：依路徑回應，並記下每次請求。 */
export function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers || {}, redirect: init?.redirect });
    const path = new URL(url).pathname;
    const page = typeof pages === 'function' ? pages(path, calls.length) : pages[path];
    const spec = page === undefined ? { status: 404, body: '404 - Not Found.' } : typeof page === 'string' ? { status: 200, body: page } : page;
    return new Response(spec.status >= 300 && spec.status < 400 ? null : spec.body || '', { status: spec.status, headers: spec.headers || {} });
  };
  return { impl, calls };
}

export const tempDir = () => mkdtemp(join(tmpdir(), 'ptt-dive-test-'));
