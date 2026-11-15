// 發新文章與「回文不引用原文」的終端機流程（對著假的 PTT 畫面）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { aidFromArticleId, createTerminal, titleProblem } from '../lib/terminal.js';
import { fakePtt } from './fake-ptt.mjs';

const ARTICLE = 'M.1794749260.A.7A7';
const AID = aidFromArticleId(ARTICLE);
const BODY = '第一段內容，寫一點自己的想法。\n\n第二段內容。';

async function loggedIn(options) {
  const ptt = fakePtt(options);
  const t = createTerminal({ connect: ptt.connect, stepTimeoutMs: 300 });
  await t.login('tester', 'secret-pw');
  return { ptt, t };
}

test('標題檢查：長度、控制字元、表情符號、Re: 開頭', () => {
  assert.equal(titleProblem('[閒聊] 這是一個正常的標題'), '');
  assert.match(titleProblem('字'.repeat(23)), /太長/);
  assert.equal(titleProblem('字'.repeat(22)), '');
  assert.match(titleProblem('短'), /太短/);
  assert.match(titleProblem('第一行\r第二行'), /控制字元/);
  assert.match(titleProblem('[閒聊] 開心 😀'), /表情符號/);
  assert.match(titleProblem('Re: [閒聊] 假裝是回文'), /Re:/);
});

test('發文：進看板 → 發表文章 → 略過分類 → 標題 → 清掉範本 → 內文 → 存檔，不加簽名檔', async () => {
  const { ptt, t } = await loggedIn();
  const result = await t.post({ board: 'C_Chat', title: '  [閒聊] 測試發文的標題  ', body: BODY });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(ptt.log.posts, [
    { board: 'C_Chat', category: '', title: '[閒聊] 測試發文的標題', cleared: 40, lines: ['第一段內容，寫一點自己的想法。', '', '第二段內容。'], by: 'tester', signature: '0\r' },
  ]);
  assert.equal(ptt.log.pushes.length + ptt.log.replies.length, 0);
  await t.logout();
});

test('發文：被禁言、發文門檻不夠、發文畫面顯示的看板不對時都不送', async () => {
  for (const [mode, code] of [['muted', 'PTT_NO_PERMISSION'], ['no-permission', 'PTT_NO_PERMISSION'], ['wrong-board', 'PTT_WRONG_BOARD']]) {
    const { ptt, t } = await loggedIn({ posting: { C_Chat: mode } });
    await assert.rejects(t.post({ board: 'C_Chat', title: '[閒聊] 不該發出去的文章', body: BODY }), (e) => e.code === code, mode);
    assert.equal(ptt.log.posts.length, 0, mode);
  }
});

test('發文：標題或內文不合、沒登入時不送；存檔後沒看到完成畫面時標明是「送出文章」這一步', async () => {
  const { ptt, t } = await loggedIn();
  await assert.rejects(t.post({ board: 'C_Chat', title: '短', body: BODY }), (e) => e.code === 'PTT_BAD_TITLE');
  await assert.rejects(t.post({ board: 'C_Chat', title: '[閒聊] 沒有內文的文章', body: ' \n ' }), (e) => e.code === 'PTT_BAD_TEXT');
  await assert.rejects(t.post({ board: '../x', title: '[閒聊] 看板名稱不對', body: BODY }), (e) => e.code === 'PTT_BAD_BOARD');
  assert.equal(ptt.log.posts.length, 0);
  assert.ok(!ptt.log.sent.includes('\x10'), '沒有按下發表文章');
  await t.logout();
  await assert.rejects(t.post({ board: 'C_Chat', title: '[閒聊] 登出之後', body: BODY }), (e) => e.code === 'PTT_NOT_LOGGED_IN');

  const silent = await loggedIn({ posting: { C_Chat: 'silent' } });
  await assert.rejects(silent.t.post({ board: 'C_Chat', title: '[閒聊] 不確定有沒有發出去', body: BODY }), (e) => e.step === '送出文章');
});

test('回文：預設引用原文；指定不引用時回答「否」', async () => {
  const quoting = await loggedIn({ articles: { ['C_Chat/' + AID]: {} } });
  await quoting.t.reply({ board: 'C_Chat', articleId: ARTICLE, body: BODY });
  assert.equal(quoting.ptt.log.replies[0].quote, 'Y\r');
  const plain = await loggedIn({ articles: { ['C_Chat/' + AID]: {} } });
  await plain.t.reply({ board: 'C_Chat', articleId: ARTICLE, body: BODY, quote: false });
  assert.equal(plain.ptt.log.replies[0].quote, 'N\r');
});
