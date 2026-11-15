// 風格庫開放給其他插件的接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_ID, STYLE_REGISTRY, pickStyleSamples, registerStyleProvider } from '../lib/style-provider.js';

const boards = {
  C_Chat: [
    { text: '這個角色真的很讚', kind: 'push', topic: '[閒聊] 新番角色討論', at: 3 },
    { text: '笑死 根本神展開', kind: 'push', topic: '[閒聊] 最新一話心得', at: 2 },
  ],
  Stock: [
    { text: '韭菜表示很痛', kind: 'boo', topic: '[新聞] 台積電法說會', at: 5 },
    { text: '歐印啦 哪次不歐印', kind: 'arrow', topic: '[請益] 該不該進場', at: 1 },
  ],
};

test('挑樣本：話題或句子對得上的排前面，並回報對上幾句；樣本沒有帳號', () => {
  const r = pickStyleSamples(boards, { query: '今天台積電法說會怎麼看', count: 2 });
  assert.equal(r.samples[0].text, '韭菜表示很痛');
  assert.equal(r.samples[0].source, 'Stock');
  assert.equal(r.matched, 1);
  assert.equal(r.total, 4);
  assert.deepEqual(Object.keys(r.samples[0]).sort(), ['kind', 'source', 'text', 'topic']);
});

test('挑樣本：沒有對上的話題時 matched 是 0，仍然給最新的幾句', () => {
  const r = pickStyleSamples(boards, { query: '晚餐吃什麼', count: 3 });
  assert.equal(r.matched, 0);
  assert.equal(r.samples.length, 3);
  assert.equal(r.samples[0].text, '韭菜表示很痛'); // 最新的
});

test('挑樣本：可以限定來源看板；不合格的看板名稱被忽略；數量有上下限', () => {
  const only = pickStyleSamples(boards, { sources: ['C_Chat'], count: 10 });
  assert.equal(only.total, 2);
  assert.ok(only.samples.every((s) => s.source === 'C_Chat'));
  assert.equal(pickStyleSamples(boards, { sources: ['../x'] }).total, 4);
  assert.equal(pickStyleSamples(boards, { count: 99 }).samples.length, 4);
  assert.equal(pickStyleSamples(boards, { count: 0 }).samples.length, 3);
  assert.deepEqual(pickStyleSamples({}, {}), { samples: [], matched: 0, total: 0 });
});

test('登記：出現在中立的登記處，狀態列出每個看板的句數；取消登記後消失', () => {
  const root = {};
  let current = boards;
  const off = registerStyleProvider(() => current, root);
  const provider = root[STYLE_REGISTRY].providers.get(PROVIDER_ID);
  assert.equal(provider.id, 'ptt');
  assert.deepEqual(provider.status(), { name: 'PTT 鄉民用語', samples: 4, sources: [{ board: 'C_Chat', count: 2 }, { board: 'Stock', count: 2 }] });
  assert.equal(provider.lookup({ query: '現在該不該進場', count: 1 }).samples[0].text, '歐印啦 哪次不歐印');
  current = {}; // 風格庫是即時讀的
  assert.equal(provider.status().samples, 0);
  assert.equal(provider.lookup({}).samples.length, 0);
  off();
  assert.equal(root[STYLE_REGISTRY].providers.has(PROVIDER_ID), false);
});

test('登記：後來的登記不會被先前的取消函式移除', () => {
  const root = {};
  const offFirst = registerStyleProvider(() => boards, root);
  registerStyleProvider(() => ({}), root);
  offFirst();
  assert.equal(root[STYLE_REGISTRY].providers.has(PROVIDER_ID), true);
});

test('挑樣本：只碰到一個雙字詞不算對上話題', () => {
  const r = pickStyleSamples(boards, { query: '進場' });
  assert.equal(r.matched, 0);
});

test('挑樣本：話題對不上時，給不同的 seed 會拿到不同順序的句子；同一個 seed 每次都一樣', () => {
  const many = { Test: Array.from({ length: 30 }, (_, i) => ({ text: '第 ' + i + ' 句樣本', kind: 'push', topic: '', at: i })) };
  const a1 = pickStyleSamples(many, { query: '晚餐吃什麼', count: 3, seed: 'msg-1' }).samples.map((s) => s.text);
  const a2 = pickStyleSamples(many, { query: '晚餐吃什麼', count: 3, seed: 'msg-1' }).samples.map((s) => s.text);
  const b = pickStyleSamples(many, { query: '晚餐吃什麼', count: 3, seed: 'msg-2' }).samples.map((s) => s.text);
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1, b);
  const newest = pickStyleSamples(many, { query: '晚餐吃什麼', count: 3 }).samples.map((s) => s.text);
  assert.deepEqual(newest, ['第 29 句樣本', '第 28 句樣本', '第 27 句樣本']); // 沒給 seed 就照新舊
  assert.equal(pickStyleSamples(many, { count: 99 }).samples.length, 12); // 一次最多 12 句
});

test('挑樣本：話題對得上的句子不受 seed 影響，永遠排最前面', () => {
  for (const seed of ['a', 'b', 'c']) assert.equal(pickStyleSamples(boards, { query: '今天台積電法說會怎麼看', seed }).samples[0].text, '韭菜表示很痛');
});
