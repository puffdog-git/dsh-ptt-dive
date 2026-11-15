import test from 'node:test';
import assert from 'node:assert/strict';
import { aidFromArticleId, createTerminal, displayWidth, pushWidthLimit } from '../lib/terminal.js';
import { fakePtt } from './fake-ptt.mjs';

const ARTICLE = 'M.1794749260.A.7A7';
const AID = aidFromArticleId(ARTICLE);
const terminal = (ptt, extra = {}) => createTerminal({ connect: ptt.connect, stepTimeoutMs: 300, ...extra });

test('文章代碼換算成終端機用的編號；格式不對的拒絕', () => {
  assert.equal(aidFromArticleId('M.1565335521.A.880'), '1TJH_XY0');
  assert.equal(AID.length, 8);
  assert.throws(() => aidFromArticleId('G.1565335521.A.880'), (e) => e.code === 'PTT_BAD_ARTICLE');
  assert.throws(() => aidFromArticleId('../x'), (e) => e.code === 'PTT_BAD_ARTICLE');
});

test('推文長度：全形字算兩欄；會顯示 IP 或還不知道的看板用比較短的上限', () => {
  assert.equal(displayWidth('推a文'), 5);
  assert.equal(pushWidthLimit({ recordsIp: true, idLength: 8 }), 32);
  assert.equal(pushWidthLimit({ recordsIp: true, idLength: 12 }), 31);
  assert.equal(pushWidthLimit({ recordsIp: null, idLength: 8 }), 32);
  assert.equal(pushWidthLimit({ recordsIp: false, idLength: 8 }), 46);
});

test('登入成功；記錄裡沒有密碼', async () => {
  const ptt = fakePtt();
  const trace = [];
  const t = terminal(ptt, { onTrace: (line) => trace.push(line) });
  await t.login('tester', 'secret-pw');
  assert.equal(t.loggedIn, true);
  assert.equal(ptt.log.sent[0], 'tester,\r'); // 帳號後加逗號，之後用 UTF-8
  assert.ok(!JSON.stringify(trace).includes('secret-pw'));
  await t.logout();
  assert.equal(ptt.log.logouts, 1);
  assert.equal(t.loggedIn, false);
});

test('登入：不踢掉其他連線、不刪登入失敗紀錄，都回答「否」', async () => {
  const ptt = fakePtt({ afterPassword: ['duplicate', 'failed-attempts', 'any-key'] });
  const t = terminal(ptt);
  await t.login('tester', 'secret-pw');
  assert.deepEqual(ptt.log.sent.slice(2, 5), ['n\r', 'n\r', ' ']);
  await t.logout();
});

test('登入：密碼錯、兩階段認證、登入太頻繁都回報清楚的原因，錯誤訊息不含密碼', async () => {
  const wrong = terminal(fakePtt());
  await assert.rejects(wrong.login('tester', 'not-the-password'), (e) => e.code === 'PTT_WRONG_LOGIN' && !e.message.includes('not-the-password'));
  assert.equal(wrong.loggedIn, false);
  await assert.rejects(terminal(fakePtt({ loginScreen: '請輸入兩階段認證驗證碼: ' })).login('tester', 'secret-pw'), (e) => e.code === 'PTT_TWO_FACTOR');
  await assert.rejects(terminal(fakePtt({ loginScreen: '登入太頻繁，請稍後再試' })).login('tester', 'secret-pw'), (e) => e.code === 'PTT_LOGIN_TOO_OFTEN');
  await assert.rejects(terminal(fakePtt()).login('bad id', 'x'), (e) => e.code === 'PTT_BAD_ID');
  await assert.rejects(terminal(fakePtt()).login('tester', 'a\rb'), (e) => e.code === 'PTT_BAD_PASSWORD');
});

async function loggedIn(options) {
  const ptt = fakePtt(options);
  const t = terminal(ptt);
  await t.login('tester', 'secret-pw');
  return { ptt, t };
}

test('推文：先確認是同一篇文章，再選種類、送內容、確認', async () => {
  const { ptt, t } = await loggedIn({ articles: { ['C_Chat/' + AID]: {} } });
  const result = await t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '這篇整理得不錯' });
  assert.deepEqual(result, { kind: 'push' });
  assert.deepEqual(ptt.log.pushes, [{ board: 'C_Chat', aid: AID, kind: 'push', text: '這篇整理得不錯', by: 'tester' }]);
  const arrow = await t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'arrow', text: '補充一下' });
  assert.equal(arrow.kind, 'arrow');
  assert.equal(ptt.log.pushes[1].kind, 'arrow');
  await t.logout();
});

test('推文：PTT 只給「→」時，「推」退成「→」並回報實際種類；「噓」不會被換成別的，直接不送', async () => {
  const { ptt, t } = await loggedIn({ articles: { ['C_Chat/' + AID]: { options: 'arrow-only' } } });
  assert.deepEqual(await t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '推一下' }), { kind: 'arrow' });
  assert.equal(ptt.log.pushes.length, 1);
  await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'boo', text: '不太行' }), (e) => e.code === 'PTT_KIND_UNAVAILABLE');
  assert.equal(ptt.log.pushes.length, 1);
});

test('推文：選項裡沒有噓的看板，噓文不送', async () => {
  const { ptt, t } = await loggedIn({ articles: { ['C_Chat/' + AID]: { options: '1.值得推薦 3.只加→註解' } } });
  await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'boo', text: '不太行' }), (e) => e.code === 'PTT_KIND_UNAVAILABLE');
  assert.equal(ptt.log.pushes.length, 0);
});

test('推文：游標不在那篇文章、文章不見、太頻繁、被禁言、禁止推文時都不送', async () => {
  const cases = [
    [{ articles: { ['C_Chat/' + AID]: {} }, wrongInfoAid: 'XXXXXXXX' }, 'PTT_WRONG_ARTICLE'],
    [{ articles: {} }, 'PTT_ARTICLE_GONE'],
    [{ articles: { ['C_Chat/' + AID]: { options: 'too-fast' } } }, 'PTT_TOO_FAST'],
    [{ articles: { ['C_Chat/' + AID]: { options: 'muted' } } }, 'PTT_NO_PERMISSION'],
    [{ articles: { ['C_Chat/' + AID]: { options: 'forbidden' } } }, 'PTT_PUSH_FORBIDDEN'],
  ];
  for (const [options, code] of cases) {
    const { ptt, t } = await loggedIn(options);
    await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '測試內容' }), (e) => e.code === code, code);
    assert.equal(ptt.log.pushes.length, 0, code);
  }
});

test('推文：內容有換行或控制字元、沒登入時不送', async () => {
  const { ptt, t } = await loggedIn({ articles: { ['C_Chat/' + AID]: {} } });
  await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '第一行\r第二行' }), (e) => e.code === 'PTT_BAD_TEXT');
  await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '   ' }), (e) => e.code === 'PTT_BAD_TEXT');
  await assert.rejects(t.push({ board: '../x', articleId: ARTICLE, kind: 'push', text: 'ok 的內容' }), (e) => e.code === 'PTT_BAD_BOARD');
  assert.equal(ptt.log.sent.filter((s) => s.includes('第一行')).length, 0);
  await t.logout();
  await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '登出後' }), (e) => e.code === 'PTT_NOT_LOGGED_IN');
});

test('推文：按鍵送出後沒看到完成畫面，錯誤標明是在「送出推文」這一步（結果不確定）', async () => {
  const { t } = await loggedIn({ articles: { ['C_Chat/' + AID]: {} }, silentAfterPush: true });
  await assert.rejects(t.push({ board: 'C_Chat', articleId: ARTICLE, kind: 'push', text: '不確定的一則' }), (e) => e.code === 'PTT_UNEXPECTED_SCREEN' && e.step === '送出推文');
});

test('回文內容整理：統一換行、去行尾空白、太長的行依欄寬折行、去掉頭尾空行', async () => {
  const { wrapBody } = await import('../lib/terminal.js');
  assert.deepEqual(wrapBody('\n第一行  \r\n\r\n第二行\n\n'), ['第一行', '', '第二行']);
  const long = wrapBody('字'.repeat(50));
  assert.deepEqual(long.map((l) => displayWidth(l)), [76, 24]);
  assert.deepEqual(wrapBody('   '), []);
});

test('回文：確認是同一篇 → 回應至看板 → 採用原標題 → 引用原文 → 寫內容 → 存檔，不加簽名檔', async () => {
  const { ptt, t } = await loggedIn({ articles: { ['C_Chat/' + AID]: {} } });
  const result = await t.reply({ board: 'C_Chat', articleId: ARTICLE, body: '我覺得這個說法有道理。\n\n補充一點自己的看法。' });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(ptt.log.replies, [{ board: 'C_Chat', aid: AID, lines: ['我覺得這個說法有道理。', '', '補充一點自己的看法。'], by: 'tester', signature: '0\r', quote: 'Y\r' }]);
  const sent = ptt.log.sent.join('|');
  assert.ok(sent.includes('F\r|Y\r|Y\r'), '依序回答三個提示');
  assert.equal(ptt.log.pushes.length, 0);
  await t.logout();
});

test('回文：文章已結案、看板不開放回覆、發文資格不足、游標不對、文章不見時都不送', async () => {
  const cases = [
    [{ articles: { ['C_Chat/' + AID]: { reply: 'closed' } } }, 'PTT_REPLY_FORBIDDEN'],
    [{ articles: { ['C_Chat/' + AID]: { reply: 'no-reply' } } }, 'PTT_REPLY_FORBIDDEN'],
    [{ articles: { ['C_Chat/' + AID]: { reply: 'no-permission' } } }, 'PTT_NO_PERMISSION'],
    [{ articles: { ['C_Chat/' + AID]: {} }, wrongInfoAid: 'XXXXXXXX' }, 'PTT_WRONG_ARTICLE'],
    [{ articles: {} }, 'PTT_ARTICLE_GONE'],
  ];
  for (const [options, code] of cases) {
    const { ptt, t } = await loggedIn(options);
    await assert.rejects(t.reply({ board: 'C_Chat', articleId: ARTICLE, body: '這是一段夠長的回文內容。' }), (e) => e.code === code, code);
    assert.equal(ptt.log.replies.length, 0, code);
  }
});

test('回文：PTT 提出警告（要求強制寫入）時不硬送；存檔後沒看到完成畫面時標明是「送出回文」這一步', async () => {
  const warned = await loggedIn({ articles: { ['C_Chat/' + AID]: { reply: 'warning' } } });
  await assert.rejects(warned.t.reply({ board: 'C_Chat', articleId: ARTICLE, body: '這是一段夠長的回文內容。' }), (e) => e.code === 'PTT_REPLY_WARNING' && e.step !== '送出回文');
  assert.equal(warned.ptt.log.replies.length, 0);
  assert.ok(!warned.ptt.log.sent.some((s) => /^W/.test(s)), '沒有回答強制寫入');
  const silent = await loggedIn({ articles: { ['C_Chat/' + AID]: { reply: 'silent' } } });
  await assert.rejects(silent.t.reply({ board: 'C_Chat', articleId: ARTICLE, body: '這是一段夠長的回文內容。' }), (e) => e.step === '送出回文');
});

test('回文：空內容或沒登入時不送', async () => {
  const { ptt, t } = await loggedIn({ articles: { ['C_Chat/' + AID]: {} } });
  await assert.rejects(t.reply({ board: 'C_Chat', articleId: ARTICLE, body: '  \n ' }), (e) => e.code === 'PTT_BAD_TEXT');
  assert.equal(ptt.log.replies.length, 0);
  await t.logout();
  await assert.rejects(t.reply({ board: 'C_Chat', articleId: ARTICLE, body: '登出之後的回文內容' }), (e) => e.code === 'PTT_NOT_LOGGED_IN');
});
