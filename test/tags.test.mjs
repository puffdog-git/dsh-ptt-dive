// 挑文章時可以指定每個看板只讀哪些分類。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPttReader } from '../lib/ptt.js';
import { createStore, normalizeConfig, validTag } from '../lib/store.js';
import { pickEntries, runRound } from '../lib/round.js';
import { createCore } from '../lib/core.js';
import { NOW, articleHtml, fakeFetch, idAt, indexHtml, tempDir } from './helpers.mjs';

const entry = (n, title, over = {}) => {
  const tag = (/^(?:Re:\s*|Fw:\s*)*\[([^\]]{1,8})\]/.exec(title) || [])[1] || '';
  return { board: 'Test', id: idAt(1, 'A' + String(n).padStart(2, '0')), title, tag, pushes: 50, time: NOW - 3600000, pinned: false, ...over };
};

test('分類名稱：不能有空白或方括號，最多八欄', () => {
  assert.equal(validTag('閒聊'), true);
  assert.equal(validTag('Vtub'), true);
  assert.equal(validTag('26秋'), true);
  assert.equal(validTag('[閒聊]'), false);
  assert.equal(validTag('閒 聊'), false);
  assert.equal(validTag(''), false);
  assert.equal(validTag('超過八欄的分類'), false);
});

test('設定：分類只留目前有刷的看板、去掉重複與不合格的；沒有分類的看板不留空清單', () => {
  const c = normalizeConfig({ boards: ['C_Chat', 'Stock'], boardTags: { C_Chat: ['閒聊', '[x]', '閒聊', '情報'], NBA: ['討論'], Stock: [] } });
  assert.deepEqual(c.boardTags, { C_Chat: ['閒聊', '情報'] });
  assert.deepEqual(normalizeConfig({}).boardTags, {});
  assert.deepEqual(normalizeConfig({ boards: ['C_Chat'], boardTags: 'nonsense' }).boardTags, {});
  // 把看板從清單拿掉，它的分類設定也跟著消失
  assert.deepEqual(normalizeConfig({ boards: ['Stock'] }, c).boardTags, {});
});

test('挑文章：有指定分類的看板只讀那些分類，回文也算原本的分類；沒指定的看板不受影響', () => {
  const entries = [
    entry(1, '[閒聊] 第一篇'),
    entry(2, '[情報] 第二篇'),
    entry(3, 'Re: [閒聊] 回第一篇'),
    entry(4, '[問題] 第四篇'),
    entry(5, '沒有分類的標題'),
    entry(6, '[問題] 別的板', { board: 'Other' }),
  ];
  const config = normalizeConfig({ boards: ['Test', 'Other'], readPerRound: 10, minPush: 0, boardTags: { Test: ['閒聊', '情報'] } });
  const picked = pickEntries(entries, config, { now: NOW });
  assert.deepEqual(picked.map((e) => e.title).sort(), ['Re: [閒聊] 回第一篇', '[問題] 別的板', '[情報] 第二篇', '[閒聊] 第一篇'].sort());
  const all = pickEntries(entries, normalizeConfig({ boards: ['Test', 'Other'], readPerRound: 10, minPush: 0 }), { now: NOW });
  assert.equal(all.length, 6);
});

test('刷一輪：設了分類後只會去讀符合分類的文章', async () => {
  const ids = [idAt(1, 'AA1'), idAt(1, 'AA2')];
  const fetch = fakeFetch({
    '/bbs/Test/index.html': indexHtml({ entries: [{ id: ids[0], title: '[閒聊] 要讀的', nrec: '爆' }, { id: ids[1], title: '[問題] 不讀的', nrec: '爆' }], prev: 0 }),
    ['/bbs/Test/' + ids[0] + '.html']: articleHtml({ title: '[閒聊] 要讀的' }),
    ['/bbs/Test/' + ids[1] + '.html']: articleHtml({ title: '[問題] 不讀的' }),
  });
  const store = await createStore({ dir: await tempDir(), now: () => NOW });
  await store.setConfig({ boards: ['Test'], pagesPerBoard: 1, boardTags: { Test: ['閒聊'] } });
  const reader = createPttReader({ fetchImpl: fetch.impl, gapMs: 500, now: () => NOW, sleep: async () => {} });
  const summary = await runRound({ reader, store, now: () => NOW });
  assert.equal(summary.read, 1);
  assert.ok(fetch.calls.some((c) => c.url.endsWith(ids[0] + '.html')));
  assert.ok(!fetch.calls.some((c) => c.url.endsWith(ids[1] + '.html')));
});

test('看板分類統計：數最近兩頁標題裡的分類，略過置底文與不合格的，依篇數排序', async () => {
  const fetch = fakeFetch({
    '/bbs/Test/index.html': indexHtml({
      entries: [{ id: idAt(1, 'AA1'), title: '[閒聊] a' }, { id: idAt(1, 'AA2'), title: 'Re: [閒聊] b' }, { id: idAt(1, 'AA3'), title: '[情報] c' }, { id: idAt(1, 'AA4'), title: '沒有分類' }],
      pinned: [{ id: idAt(1, 'AA9'), title: '[公告] 板規' }],
      prev: 7,
    }),
    '/bbs/Test/index7.html': indexHtml({ entries: [{ id: idAt(2, 'AB1'), title: '[閒聊] d' }, { id: idAt(2, 'AB2'), title: '[問題] e' }], prev: 6 }),
  });
  const store = await createStore({ dir: await tempDir(), now: () => NOW });
  const reader = createPttReader({ fetchImpl: fetch.impl, gapMs: 500, now: () => NOW, sleep: async () => {} });
  const core = await createCore({ get: () => undefined }, { store, reader, now: () => NOW });
  const stats = await core.boardTagStats('Test');
  assert.equal(stats.total, 6);
  assert.deepEqual(stats.tags[0], { tag: '閒聊', count: 3 });
  assert.deepEqual(stats.tags.map((t) => t.tag).sort(), ['問題', '情報', '閒聊'].sort());
  assert.equal(fetch.calls.length, 2); // 只讀兩頁列表，沒有讀任何文章
  await core.dispose();
});
