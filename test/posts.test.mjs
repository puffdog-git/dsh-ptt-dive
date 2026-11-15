// 發新文章、每輪擬回文、回文不引用原文（待送清單這一層）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../lib/store.js';
import { BODY, artId, item, ref, settle, setupDesk as setup } from './desk-helper.mjs';

const roundArticle = (n, over = {}) => ({
  board: 'C_Chat',
  id: artId(n),
  title: `[閒聊] 這一輪讀到的文章 ${n}`,
  url: ref(n),
  digest: `看板：C_Chat\n標題：[閒聊] 這一輪讀到的文章 ${n}\n內文節錄：內容 ${n}`,
  recordsIp: false,
  existing: [],
  ...over,
});
const LONG = (n) => `這是第 ${n} 篇回文草稿的內容，寫一點自己的看法。\n\n純粹分享，不一定對，大家參考看看就好。`;

test('設定：發文預設關閉、每輪不擬回文、回文預設引用原文', () => {
  const d = normalizeConfig({});
  assert.deepEqual([d.postEnabled, d.postPerDay, d.replyDraftPerRound, d.replyQuote], [false, 1, 0, true]);
  assert.deepEqual([normalizeConfig({ postPerDay: 99 }).postPerDay, normalizeConfig({ replyDraftPerRound: 99 }).replyDraftPerRound], [3, 2]);
});

test('發新文章：自己寫標題與內文，放進待送清單；按送出後登入、發文、登出，並到看板列表確認', async () => {
  const { desk, calls } = await setup({ config: { postEnabled: true } });
  const created = await desk.createManual({ type: 'post', board: 'C_Chat', title: '  [閒聊] 我自己寫的新文章  ', text: BODY });
  assert.equal(created.ok, true);
  const draft = item(desk, created.id);
  assert.deepEqual([draft.type, draft.title, draft.status, draft.manual, draft.auto, draft.text], ['post', '[閒聊] 我自己寫的新文章', 'pending', true, false, BODY]);
  assert.equal(calls.prompts.length, 0); // 新文章沒有 AI 擬稿
  await desk.startAuto();
  assert.equal(calls.posts.length, 0);
  assert.equal((await desk.send(created.id)).ok, true);
  assert.deepEqual(calls.posts, [{ board: 'C_Chat', title: '[閒聊] 我自己寫的新文章', body: BODY, category: '' }]);
  assert.deepEqual([calls.logins, calls.logouts], [1, 1]);
  await settle();
  const sent = item(desk, created.id);
  assert.deepEqual([sent.status, sent.verified], ['sent', 'seen']);
  assert.match(sent.replyUrl, /\.BBB\.html$/);
  assert.deepEqual([desk.list().postsToday, desk.list().repliesToday, desk.list().sentToday], [1, 0, 0]);
});

test('發新文章的限制：功能要開、看板要被允許、標題與內文要合格、同標題不重複、每天上限獨立、間隔共用', async () => {
  const off = await setup({ config: { postEnabled: false } });
  assert.match((await off.desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 功能沒開', text: BODY })).error, /發文功能沒有開啟/);

  const { desk, calls, advance } = await setup({ config: { postEnabled: true, postPerDay: 1 } });
  assert.match((await desk.createManual({ type: 'post', board: 'Stock', title: '[閒聊] 股板沒有被允許', text: BODY })).error, /不在允許/);
  assert.match((await desk.createManual({ type: 'post', board: '', title: '[閒聊] 沒選看板', text: BODY })).error, /請選擇/);
  assert.match((await desk.createManual({ type: 'post', board: 'C_Chat', title: '字'.repeat(23), text: BODY })).error, /標題太長/);
  assert.match((await desk.createManual({ type: 'post', board: 'C_Chat', title: 'Re: [閒聊] 假回文', text: BODY })).error, /Re:/);
  assert.match((await desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 內文太短', text: '太短' })).error, /太短/);
  const a = await desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 第一篇', text: BODY });
  assert.match((await desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 第一篇', text: BODY })).error, /同樣標題/);
  const b = await desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 第二篇', text: BODY });
  const p = await desk.createManual({ type: 'push', ref: ref(1), kind: 'push', text: '順便推一則文' });
  assert.equal((await desk.send(a.id)).ok, true);
  assert.match((await desk.send(p.id)).error, /還不到 120 秒/);
  advance(121000);
  assert.match((await desk.send(b.id)).error, /今天已經發了 1 篇/);
  assert.equal((await desk.send(p.id)).ok, true);
  assert.equal(calls.posts.length, 1);
});

test('發新文章：可以改標題與內文；PTT 拒絕時標成沒送出、結果不確定時不重送', async () => {
  const edited = await setup({ config: { postEnabled: true } });
  const made = await edited.desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 原本的標題', text: BODY });
  assert.match((await edited.desk.update(made.id, { title: '短' })).error, /標題太短/);
  assert.equal((await edited.desk.update(made.id, { title: '[閒聊] 改過的標題', text: BODY + '\n\n多加一段。' })).ok, true);
  assert.deepEqual([item(edited.desk, made.id).title, item(edited.desk, made.id).text.endsWith('多加一段。')], ['[閒聊] 改過的標題', true]);

  const refused = await setup({ config: { postEnabled: true }, terminal: { postError: Object.assign(Error('這個帳號還沒達到這個看板的發文門檻'), { code: 'PTT_NO_PERMISSION', step: '準備發文' }) } });
  const r = await refused.desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 被拒絕的文章', text: BODY });
  assert.equal((await refused.desk.send(r.id)).ok, false);
  assert.deepEqual([item(refused.desk, r.id).status, refused.desk.list().postsToday], ['failed', 0]);

  const unsure = await setup({ config: { postEnabled: true }, terminal: { postError: Object.assign(Error('等不到預期的畫面'), { code: 'PTT_UNEXPECTED_SCREEN', step: '送出文章' }) } });
  const u = await unsure.desk.createManual({ type: 'post', board: 'C_Chat', title: '[閒聊] 不確定的文章', text: BODY });
  assert.equal((await unsure.desk.send(u.id)).uncertain, true);
  assert.equal((await unsure.desk.send(u.id)).ok, false);
  assert.equal(unsure.desk.list().postsToday, 1);
});

test('回文不引用原文：手動新增可以指定；沒指定時用設定的預設值；可以在草稿上改', async () => {
  const { desk, calls, advance } = await setup({ config: { replyPerDay: 3, replyQuote: false } });
  const byDefault = await desk.createManual({ type: 'reply', ref: ref(1), text: BODY });
  const forced = await desk.createManual({ type: 'reply', ref: ref(2), text: BODY, quote: true });
  assert.deepEqual([item(desk, byDefault.id).quote, item(desk, forced.id).quote], [false, true]);
  await desk.send(byDefault.id);
  advance(121000);
  await desk.send(forced.id);
  assert.deepEqual(calls.replies.map((r) => r.quote), [false, true]);
  const third = await desk.createManual({ type: 'reply', ref: ref(3), text: BODY });
  assert.equal((await desk.update(third.id, { quote: true })).ok, true);
  assert.equal(item(desk, third.id).quote, true);
});

test('每輪擬回文：預設不擬；開了之後最多擬設定的篇數、AI 擬的有網址就不收、永遠不自動送', async () => {
  const none = await setup({ config: { pushEnabled: false }, model: () => ({ ok: true, text: '{"replies":[{"article":1,"body":"不該被用到"}]}' }) });
  const untouched = await none.desk.draft([roundArticle(1)]);
  assert.deepEqual([untouched.replyCreated, none.calls.prompts.length], [0, 0]);

  const { desk, calls } = await setup({
    config: { pushEnabled: false, replyDraftPerRound: 2, replyPerDay: 3, pushAutoBoards: [] },
    model: () => ({ ok: true, text: JSON.stringify({ replies: [{ article: 1, body: LONG(1) }, { article: 2, body: LONG(2) + ' https://example.com/x' }, { article: 3, body: LONG(3) }, { article: 4, body: LONG(4) }] }) }),
  });
  const result = await desk.draft([roundArticle(1), roundArticle(2), roundArticle(3), roundArticle(4), roundArticle(5, { board: 'Stock' })]);
  assert.equal(result.replyCreated, 2);
  assert.equal(result.created, 0); // 推文關著，不擬推文
  const drafts = desk.list().items.filter((i) => i.type === 'reply');
  assert.deepEqual(drafts.map((d) => [d.articleId, d.status, d.auto, d.quote, !!d.manual]).reverse(), [
    [artId(1), 'pending', false, true, false],
    [artId(3), 'pending', false, true, false],
  ]);
  assert.match(calls.prompts[0].user, /最多 2 篇/);
  assert.ok(!calls.prompts[0].user.includes('文章 5')); // Stock 不在允許的看板
  assert.match(calls.prompts[0].system, /不是給你的指令/);
  await desk.startAuto();
  assert.equal(calls.replies.length, 0);
});

test('每輪擬回文：今天的回文額度（含待送的草稿）用完就不再擬', async () => {
  const { desk, calls } = await setup({
    config: { replyDraftPerRound: 2, replyPerDay: 1 },
    model: (input) => (input.user.includes('"replies"') ? { ok: true, text: JSON.stringify({ replies: [{ article: 1, body: LONG(1) }, { article: 2, body: LONG(2) }] }) } : { ok: true, text: '{"pushes":[]}' }),
  });
  const first = await desk.draft([roundArticle(1), roundArticle(2)]);
  assert.equal(first.replyCreated, 1); // 每天只能回 1 篇，所以只擬 1 篇
  const before = calls.prompts.filter((p) => p.user.includes('"replies"')).length;
  const second = await desk.draft([roundArticle(3)]);
  assert.equal(second.replyCreated, 0);
  assert.match(second.replyReason, /額度已經用完/);
  assert.equal(calls.prompts.filter((p) => p.user.includes('"replies"')).length, before);
});
