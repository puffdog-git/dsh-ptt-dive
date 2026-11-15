import test from 'node:test';
import assert from 'node:assert/strict';
import { createPttReader, parseArticle, parseArticleRef, parseBoardIndex, parsePushCount, validBoard } from '../lib/ptt.js';
import { articleHtml, fakeFetch, idAt, indexHtml } from './helpers.mjs';

test('推文數欄位：數字、爆、X 系列、空白', () => {
  assert.equal(parsePushCount('23'), 23);
  assert.equal(parsePushCount('爆'), 100);
  assert.equal(parsePushCount('X3'), -30);
  assert.equal(parsePushCount('XX'), -100);
  assert.equal(parsePushCount(''), 0);
});

test('看板列表：取出文章、略過刪文、標出置底、找到上一頁', () => {
  const html = indexHtml({
    entries: [
      { id: idAt(1, 'AAA'), title: '[問卦] 第一篇 &amp; 測試', nrec: '爆' },
      { id: idAt(2, 'AAB'), title: 'Re: [閒聊] 回文', nrec: '5' },
      { deleted: true },
    ],
    pinned: [{ id: idAt(200, 'AAC'), title: '[公告] 板規', nrec: '54' }],
    prev: 321,
  });
  const { entries, prevPage, over18 } = parseBoardIndex(html, 'Test');
  assert.equal(over18, false);
  assert.equal(prevPage, 321);
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => [e.title, e.pushes, e.pinned, e.isReply, e.tag]),
    [
      ['[問卦] 第一篇 & 測試', 100, false, false, '問卦'],
      ['Re: [閒聊] 回文', 5, false, true, '閒聊'],
      ['[公告] 板規', 54, true, false, '公告'],
    ],
  );
  assert.equal(entries[0].url, 'https://www.ptt.cc/bbs/Test/' + idAt(1, 'AAA') + '.html');
  assert.ok(entries[0].time > 0);
});

test('看板列表：年齡確認頁會被認出來', () => {
  const html = '<html><body><form action="/ask/over18" method="post"><div class="over18-notice">本看板需滿十八歲</div></form></body></html>';
  assert.equal(parseBoardIndex(html, 'Test').over18, true);
});

test('文章：標頭、內文在發信站之前截斷、推文分類、圖片連結', () => {
  const html = articleHtml({
    body: '第一行 &lt;b&gt;\n<a href="https://i.imgur.com/abc.png" target="_blank">https://i.imgur.com/abc.png</a>\n<span class="f2 hl">上色的字</span>',
    pushes: [
      ['推', 'alice', '這篇必推'],
      ['噓', 'bob', '不太同意'],
      ['→', 'carol', '補充一下'],
    ],
  });
  const a = parseArticle(html);
  assert.equal(a.ok, true);
  assert.equal(a.meta.title, '[閒聊] 測試文章');
  assert.equal(a.meta.authorId, 'user1');
  assert.equal(a.meta.nickname, '暱稱');
  assert.equal(a.body, '第一行 <b>\nhttps://i.imgur.com/abc.png\n上色的字');
  assert.ok(!a.body.includes('發信站') && !a.body.includes('203.0.113.7'));
  assert.deepEqual(a.counts, { push: 1, boo: 1, arrow: 1 });
  assert.deepEqual(a.pushes.map((p) => [p.kind, p.user, p.text, p.when]), [
    ['push', 'alice', '這篇必推', '11/15 20:05'],
    ['boo', 'bob', '不太同意', '11/15 20:05'],
    ['arrow', 'carol', '補充一下', '11/15 20:05'],
  ]);
  assert.deepEqual(a.images, ['https://i.imgur.com/abc.png']);
});

test('文章：推文時間欄帶 IP 的看板，IP 不會留下來', () => {
  const a = parseArticle(articleHtml({ pushes: [['推', 'alice', '有 IP 的推文']], withIp: true }));
  assert.equal(a.pushes[0].when, '11/15 20:05');
  assert.ok(!JSON.stringify(a.pushes).includes('203.0.113.9'));
});

test('文章位置：網址與「看板/代碼」都認得，其他拒絕', () => {
  assert.deepEqual(parseArticleRef('https://www.ptt.cc/bbs/C_Chat/M.1794749260.A.7A7.html'), { board: 'C_Chat', id: 'M.1794749260.A.7A7' });
  assert.deepEqual(parseArticleRef('Stock/M.1794749260.A.7A7'), { board: 'Stock', id: 'M.1794749260.A.7A7' });
  assert.equal(parseArticleRef('../../etc/passwd'), null);
  assert.equal(parseArticleRef('C_Chat/index.html'), null);
  assert.equal(validBoard('a/b'), false);
  assert.equal(validBoard('C_Chat'), true);
});

function reader(pages, extra = {}) {
  const fetch = fakeFetch(pages);
  let clock = 1000;
  const sleeps = [];
  const r = createPttReader({
    fetchImpl: fetch.impl,
    gapMs: 1500,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...extra,
  });
  return { r, fetch, sleeps, advance: (ms) => (clock += ms) };
}

test('讀取器：只連 www.ptt.cc、不跟隨轉址、請求之間有間隔', async () => {
  const { r, fetch, sleeps } = reader({ '/bbs/Test/index.html': indexHtml({ entries: [{ id: idAt(1), title: '[閒聊] a' }] }) });
  await r.listBoard('Test');
  await r.listBoard('Test');
  assert.equal(fetch.calls.length, 2);
  assert.ok(fetch.calls.every((c) => c.url.startsWith('https://www.ptt.cc/bbs/Test/') && c.redirect === 'manual'));
  assert.deepEqual(sleeps, [1500]);
  assert.equal(fetch.calls[0].headers.cookie, undefined);
});

test('讀取器：沒勾滿 18 歲時不帶 cookie，遇到年齡確認回報清楚的錯誤；勾了才帶', async () => {
  const pages = { '/bbs/Gossiping/index.html': { status: 302, headers: { location: '/ask/over18?from=%2Fbbs%2FGossiping%2Findex.html' } } };
  const { r } = reader(pages);
  await assert.rejects(r.listBoard('Gossiping'), (e) => e.code === 'PTT_OVER18');
  const adult = reader({ '/bbs/Gossiping/index.html': indexHtml({ board: 'Gossiping', entries: [] }) }, { over18: () => true });
  await adult.r.listBoard('Gossiping');
  assert.equal(adult.fetch.calls[0].headers.cookie, 'over18=1');
});

test('讀取器：被限流後進入暫停，暫停期間完全不發請求，到期後恢復', async () => {
  let blocked = true;
  const { r, fetch, advance } = reader((path) => (blocked ? { status: 429, body: '' } : indexHtml({ entries: [] })), { pauseMs: 600000 });
  await assert.rejects(r.listBoard('Test'), (e) => e.code === 'PTT_PAUSED');
  assert.equal(r.state().paused, true);
  await assert.rejects(r.listBoard('Test'), (e) => e.code === 'PTT_PAUSED');
  await assert.rejects(r.readArticle('Test', idAt(1)), (e) => e.code === 'PTT_PAUSED');
  assert.equal(fetch.calls.length, 1);
  blocked = false;
  advance(600001);
  await r.listBoard('Test');
  assert.equal(fetch.calls.length, 2);
});

test('讀取器：看板或文章代碼格式不對時不發請求', async () => {
  const { r, fetch } = reader({});
  await assert.rejects(r.listBoard('../x'), (e) => e.code === 'PTT_BAD_BOARD');
  await assert.rejects(r.readArticle('Test', 'index'), (e) => e.code === 'PTT_BAD_ARTICLE');
  assert.equal(fetch.calls.length, 0);
  await assert.rejects(r.listBoard('Nope'), (e) => e.code === 'PTT_NOT_FOUND');
});
