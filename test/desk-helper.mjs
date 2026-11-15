// 待送清單測試共用的假環境：假的讀取器、假的終端機、假的模型。
import { createPushDesk } from '../lib/pushes.js';
import { normalizeConfig } from '../lib/store.js';
import { NOW, idAt, tempDir } from './helpers.mjs';

export const BODY = '我覺得原 po 講的有道理。\n\n不過這只是我自己的看法，大家參考就好。';
export const artId = (n) => idAt(n, 'AA' + n);
export const ref = (n, board = 'C_Chat') => `https://www.ptt.cc/bbs/${board}/${artId(n)}.html`;
export const settle = () => new Promise((r) => setTimeout(r, 20));
export const item = (desk, id) => desk.list().items.find((i) => i.id === id);

export async function setupDesk({ config = {}, model, terminal = {}, account = { id: 'tester', password: 'secret-pw' }, missing = [] } = {}) {
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
        pushes: [{ kind: 'push', user: 'someone', text: '已經有人這樣推了', when: '11/15 20:00' }],
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
