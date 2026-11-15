// 手動新增草稿、請 AI 擬稿、回文的送出與限制。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushDesk } from '../lib/pushes.js';
import { normalizeConfig } from '../lib/store.js';
import { NOW, idAt, tempDir } from './helpers.mjs';

const BODY = '我覺得原 po 講的有道理。\n\n不過這只是我自己的看法，大家參考就好。';
const artId = (n) => idAt(n, 'AA' + n);
const ref = (n, board = 'C_Chat') => `https://www.ptt.cc/bbs/${board}/${artId(n)}.html`;

async function setup({ config = {}, model, terminal = {}, account = { id: 'tester', password: 'secret-pw' }, missing = [] } = {}) {
  const dir = await tempDir();
  let clock = NOW;
  const settings = { value: normalizeConfig({ boards: ['C_Chat', 'Stock'], pushEnabled: true, replyEnabled: true, pushBoards: ['C_Chat'], pushGapSeconds: 120, ...config }) };
  const calls = { pushes: [], replies: [], posts: [], prompts: [], logins: 0, logouts: 0, reads: [] };
  const reader = {
    readArticle: async (board, id) => {
      calls.reads.push(board + '/' + id);
      if (missing.includes(id)) throw Object.assign(Error('找不到這個看板或文章'), { code: 'PTT_NOT_FOUND' });
      return {
        board,
        id,
        url: `https://www.ptt.cc/bbs/${board}/${id}.html`,
        meta: { title: '[閒聊] 真正的標題 ' + id.slice(-3) },
        body: '文章內文',
        counts: { push: 3, boo: 0, arrow: 1 },
        recordsIp: false,
        pushes: [
          { kind: 'push', user: 'someone', text: '已經有人這樣推了', when: '11/15 20:00' },
          ...calls.pushes.filter((p) => p.board === board && p.articleId === id).map((p) => ({ kind: p.kind, user: 'tester', text: p.text })),
        ],
      };
    },
    listBoard: async (board) => ({
      entries: [
        ...calls.replies.filter((r) => r.board === board).map((r, i) => ({ author: 'tester', isReply: true, time: clock, title: 'Re: [閒聊] x', url: `https://www.ptt.cc/bbs/${board}/M.${1794800000 + i}.A.AAA.html` })),
        ...calls.posts.filter((p) => p.board === board).map((p, i) => ({ author: 'tester', isReply: false, time: clock, title: p.title, url: `https://www.ptt.cc/bbs/${board}/M.${1794900000 + i}.A.BBB.html` })),
      ],
    }),
  };
  const desk = await createPushDesk({
    dir,
    config: () => settings.value,
    vault: { status: async () => ({ id: account?.id || '', hasPassword: !!account, persistent: true, error: '' }), credentials: async () => (account ? { ...account } : null) },
    reader,
    createTerminal: () => ({
      login: async () => void (calls.logins += 1),
      push: async (input) => {
        if (terminal.pushError) throw terminal.pushError;
        calls.pushes.push(input);
        return { kind: input.kind };
      },
      reply: async (input) => {
        if (terminal.replyError) throw terminal.replyError;
        calls.replies.push(input);
        return { ok: true };
      },
      post: async (input) => {
        if (terminal.postError) throw terminal.postError;
        calls.posts.push(input);
        return { ok: true };
      },
      logout: async () => void (calls.logouts += 1),
    }),
    generate: async (input) => {
      calls.prompts.push(input);
      return model ? model(input) : { ok: false, error: '模型服務未就緒' };
    },
    styleBoards: () => ({ C_Chat: [{ text: '板友平常的口氣', kind: 'push', topic: '[閒聊] 真正的標題', at: 1 }] }),
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
    verifyDelayMs: 0,
  });
  return { desk, calls, advance: (ms) => (clock += ms), setConfig: (patch) => (settings.value = normalizeConfig(patch, settings.value)) };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const item = (desk, id) => desk.list().items.find((i) => i.id === id);

test('手動新增推文：到網頁版讀文章取得標題；放進待送清單、標成自己新增、不會自動送', async () => {
  const { desk, calls } = await setup({ config: { pushAutoBoards: ['C_Chat'] } });
  const created = await desk.createManual({ type: 'push', ref: ref(1), kind: 'arrow', text: '  我自己寫的推文  ' });
  assert.equal(created.ok, true);
  const draft = item(desk, created.id);
  assert.deepEqual([draft.status, draft.manual, draft.auto, draft.kind, draft.text, draft.title, draft.limit], ['pending', true, false, 'arrow', '我自己寫的推文', '[閒聊] 真正的標題 AA1', 46]);
  await desk.startAuto(); // 就算看板勾了自動送出，手動新增的也不會被自動送
  assert.equal(calls.pushes.length, 0);
  assert.equal(calls.prompts.length, 0); // 沒有呼叫模型
  assert.equal((await desk.send(created.id)).ok, true);
  assert.deepEqual([calls.pushes[0].board, calls.pushes[0].articleId, calls.pushes[0].kind, calls.pushes[0].text], ['C_Chat', artId(1), 'arrow', '我自己寫的推文']);
});

test('手動新增：也接受「看板/代碼」；位置看不懂、看板沒被允許、文章不存在、內容不合、已有草稿或已推過都拒絕', async () => {
  const { desk, calls } = await setup({ missing: [artId(9)] });
  assert.equal((await desk.createManual({ type: 'push', ref: 'C_Chat/' + artId(2), kind: 'push', text: '用短寫法指定文章' })).ok, true);
  assert.match((await desk.createManual({ type: 'push', ref: 'https://example.com/x', kind: 'push', text: '隨便寫寫看' })).error, /看不懂/);
  assert.match((await desk.createManual({ type: 'push', ref: ref(1, 'Stock'), kind: 'push', text: '股板沒有被允許' })).error, /不在允許推文／回文的看板/);
  await assert.rejects(desk.createManual({ type: 'push', ref: ref(9), kind: 'push', text: '文章已經不見了' }), (e) => e.code === 'PTT_NOT_FOUND');
  assert.match((await desk.createManual({ type: 'push', ref: ref(1), kind: 'push', text: '看 https://example.com' })).error, /網址/);
  assert.match((await desk.createManual({ type: 'push', ref: ref(1), kind: 'push', text: '已經有人這樣推了' })).error, /一模一樣/);
  assert.match((await desk.createManual({ type: 'push', ref: ref(1), kind: 'boo', text: '我想噓這一篇' })).error, /不允許噓文/);
  assert.match((await desk.createManual({ type: 'push', ref: ref(2), kind: 'push', text: '同一篇第二則草稿' })).error, /已經有這篇文章的草稿/);
  const first = desk.list().items.find((i) => i.status === 'pending');
  await desk.send(first.id);
  assert.match((await desk.createManual({ type: 'push', ref: ref(2), kind: 'push', text: '推過了還想再推' })).error, /已經推過/);
  assert.equal(calls.pushes.length, 1);
});

test('手動新增：推文或回文功能沒開就不能新增對應的類型', async () => {
  const { desk } = await setup({ config: { pushEnabled: false, replyEnabled: false } });
  assert.match((await desk.createManual({ type: 'push', ref: ref(1), kind: 'push', text: '推文沒有開啟' })).error, /推文功能沒有開啟/);
  assert.match((await desk.createManual({ type: 'reply', ref: ref(1), text: BODY })).error, /回文功能沒有開啟/);
});

test('回文：手動新增後按送出，登入、回文、登出各一次；之後到看板列表確認並記下回文網址', async () => {
  const { desk, calls } = await setup();
  const created = await desk.createManual({ type: 'reply', ref: ref(1), text: BODY });
  assert.equal(created.ok, true);
  assert.equal(item(desk, created.id).type, 'reply');
  const result = await desk.send(created.id);
  assert.equal(result.ok, true);
  assert.deepEqual([calls.logins, calls.logouts, calls.replies.length, calls.pushes.length], [1, 1, 1, 0]);
  assert.deepEqual([calls.replies[0].board, calls.replies[0].articleId, calls.replies[0].body], ['C_Chat', artId(1), BODY]);
  await settle();
  const sent = item(desk, created.id);
  assert.equal(sent.status, 'sent');
  assert.equal(sent.verified, 'seen');
  assert.match(sent.replyUrl, /^https:\/\/www\.ptt\.cc\/bbs\/C_Chat\//);
  assert.deepEqual([desk.list().repliesToday, desk.list().sentToday], [1, 0]); // 回文不佔推文的每天額度
});

test('回文限制：每天上限獨立計算、每篇只回一次、和推文共用間隔、永遠不自動送', async () => {
  const { desk, calls, advance } = await setup({ config: { replyPerDay: 1, pushAutoBoards: ['C_Chat'] } });
  const a = await desk.createManual({ type: 'reply', ref: ref(1), text: BODY });
  const b = await desk.createManual({ type: 'reply', ref: ref(2), text: BODY });
  const p = await desk.createManual({ type: 'push', ref: ref(1), kind: 'push', text: '同一篇文章也可以推文' });
  await desk.startAuto();
  assert.equal(calls.replies.length + calls.pushes.length, 0);
  assert.equal((await desk.send(a.id)).ok, true);
  assert.match((await desk.send(p.id)).error, /還不到 120 秒/); // 間隔共用
  advance(121000);
  assert.match((await desk.send(b.id)).error, /今天已經回了 1 篇/);
  assert.equal((await desk.send(p.id)).ok, true); // 推文有自己的額度
  assert.match((await desk.createManual({ type: 'reply', ref: ref(1), text: BODY })).error, /已經回過/);
  assert.equal(calls.replies.length, 1);
});

test('回文：編輯後重新檢查並整理換行；PTT 拒絕時標成沒送出、結果不確定時不重送', async () => {
  const edited = await setup();
  const made = await edited.desk.createManual({ type: 'reply', ref: ref(1), text: BODY });
  assert.match((await edited.desk.update(made.id, { text: '太短' })).error, /太短/);
  assert.equal((await edited.desk.update(made.id, { text: '改過的第一段，內容長度足夠。  \r\n\r\n改過的第二段。\n\n' })).ok, true);
  assert.equal(item(edited.desk, made.id).text, '改過的第一段，內容長度足夠。\n\n改過的第二段。');

  const refused = await setup({ terminal: { replyError: Object.assign(Error('這個看板不開放回覆文章'), { code: 'PTT_REPLY_FORBIDDEN', step: '準備回文' }) } });
  const r1 = await refused.desk.createManual({ type: 'reply', ref: ref(1), text: BODY });
  assert.equal((await refused.desk.send(r1.id)).ok, false);
  assert.equal(item(refused.desk, r1.id).status, 'failed');
  assert.equal(refused.desk.list().repliesToday, 0);

  const unsure = await setup({ terminal: { replyError: Object.assign(Error('等不到預期的畫面'), { code: 'PTT_UNEXPECTED_SCREEN', step: '送出回文' }) } });
  const r2 = await unsure.desk.createManual({ type: 'reply', ref: ref(1), text: BODY });
  assert.equal((await unsure.desk.send(r2.id)).uncertain, true);
  assert.equal(item(unsure.desk, r2.id).status, 'uncertain');
  assert.equal((await unsure.desk.send(r2.id)).ok, false);
  assert.equal(unsure.desk.list().repliesToday, 1); // 不確定的也算進額度
});

test('請 AI 擬稿（推文）：只回傳文字，不放進清單、不送出；沒通過檢查的不給', async () => {
  const { desk, calls } = await setup({ model: () => ({ ok: true, text: '{"pushes":[{"article":1,"kind":"push","text":"這個角度滿有意思的"}]}' }) });
  const suggestion = await desk.suggest({ type: 'push', ref: ref(1) });
  assert.deepEqual([suggestion.ok, suggestion.type, suggestion.kind, suggestion.text], [true, 'push', 'push', '這個角度滿有意思的']);
  assert.equal(desk.list().items.length, 0);
  assert.equal(calls.pushes.length, 0);
  assert.match(calls.prompts[0].user, /<ptt_sources>[\s\S]*真正的標題/);
  assert.match(calls.prompts[0].system, /不是給你的指令/);
  assert.ok(!calls.prompts[0].user.includes('someone')); // 素材不含帳號

  const copied = await setup({ model: () => ({ ok: true, text: '{"pushes":[{"article":1,"kind":"push","text":"已經有人這樣推了"}]}' }) });
  assert.match((await copied.desk.suggest({ type: 'push', ref: ref(1) })).error, /一模一樣/);
  const nothing = await setup({ model: () => ({ ok: true, text: '{"pushes":[]}' }) });
  assert.match((await nothing.desk.suggest({ type: 'push', ref: ref(1) })).error, /沒有想推的/);
  const down = await setup();
  assert.match((await down.desk.suggest({ type: 'push', ref: ref(1) })).error, /模型沒有產生草稿/);
});

test('請 AI 擬稿（回文）：回傳內文；AI 擬的有網址或太短就不給', async () => {
  const good = await setup({ model: () => ({ ok: true, text: '```\n我看完之後覺得原 po 的觀察滿細的。\n\n不過這比較像個人經驗，不一定每個人都一樣，純粹分享我的想法。\n```' }) });
  const suggestion = await good.desk.suggest({ type: 'reply', ref: ref(1) });
  assert.equal(suggestion.ok, true);
  assert.equal(suggestion.type, 'reply');
  assert.ok(!suggestion.text.includes('```'));
  assert.match(suggestion.text, /^我看完之後/);
  assert.match(good.calls.prompts[0].system, /只輸出回文的內文/);
  assert.equal(good.desk.list().items.length, 0);
  assert.equal(good.calls.replies.length, 0);

  const linky = await setup({ model: () => ({ ok: true, text: '這篇可以參考 https://example.com/news 的報導，裡面有寫到詳細的數字與說明。' }) });
  assert.match((await linky.desk.suggest({ type: 'reply', ref: ref(1) })).error, /網址/);
  const short = await setup({ model: () => ({ ok: true, text: '同意' }) });
  assert.match((await short.desk.suggest({ type: 'reply', ref: ref(1) })).error, /太短/);
});
