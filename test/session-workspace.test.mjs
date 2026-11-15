// 日報會話可以指定建在哪個工作區（「放在正式會話」模式）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPttReader } from '../lib/ptt.js';
import { createStore } from '../lib/store.js';
import { createCore } from '../lib/core.js';
import { NOW, articleHtml, fakeFetch, idAt, indexHtml, tempDir } from './helpers.mjs';

/** 假的宿主：有模型清單、會話與工作區服務；每個會話回一段固定的日報文字。 */
function fakeHost() {
  const created = [];
  const attached = [];
  const services = {
    llm: { listProviders: () => [{ id: 'deepseek-account' }] },
    agents: {
      create: async (options) => {
        const events = [];
        const record = { cwd: options.meta.cwd, title: options.meta.title };
        created.push(record);
        await options.setup({ systemPrompt: { section: () => {} }, tools: { restrict: () => () => {} } });
        const agent = {
          ctx: {},
          session: { get seq() { return events.length; }, snapshotEvents: (from) => events.slice(from) },
          followup: () => {
            events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '## Test\n\n今天在聊測試。' }] } } });
            events.push({ type: 'turn/end', data: { reason: { kind: 'completed' } } });
          },
          whenIdle: async () => {},
          cancel: () => {},
        };
        return { agent, dispose: async () => {} };
      },
    },
    workspaceRegistry: { create: async (cwd) => ({ attachSession: async (id) => attached.push({ cwd, id }) }) },
  };
  return { ctx: { get: (name) => services[name] }, created, attached };
}

async function setup(configPatch) {
  const id = idAt(1, 'AA1');
  const fetch = fakeFetch({
    '/bbs/Test/index.html': indexHtml({ entries: [{ id, title: '[閒聊] 熱門話題', nrec: '爆' }], prev: 0 }),
    ['/bbs/Test/' + id + '.html']: articleHtml({ title: '[閒聊] 熱門話題', pushes: [['推', 'alice', '這個觀點滿有道理的']] }),
  });
  const store = await createStore({ dir: await tempDir(), now: () => NOW });
  await store.setConfig({ boards: ['Test'], pagesPerBoard: 1, memoryDelivery: 'session', ...configPatch });
  const reader = createPttReader({ fetchImpl: fetch.impl, gapMs: 500, now: () => NOW, sleep: async () => {} });
  const host = fakeHost();
  const core = await createCore(host.ctx, { store, reader, now: () => NOW });
  return { core, store, host };
}

test('日報會話：沒指定工作區時建在插件自己的工作區', async () => {
  const { core, store, host } = await setup({});
  core.startRound('manual');
  await core.job().done;
  const last = store.state().lastRound;
  assert.equal(last.report.usedModel, true);
  assert.equal(host.created[0].cwd, store.workspaceDir);
  assert.deepEqual([last.memory.status, last.memory.workspace], ['delegated', store.workspaceDir]);
  await core.dispose();
});

test('日報會話：指定工作區後，會話建在那個工作區並掛到那個工作區底下', async () => {
  const chosen = await tempDir();
  const { core, store, host } = await setup({ memoryWorkspace: chosen });
  core.startRound('manual');
  await core.job().done;
  const last = store.state().lastRound;
  assert.equal(host.created.length, 1);
  assert.equal(host.created[0].cwd, chosen);
  assert.match(host.created[0].title, /^PTT 日報 · 2026-11-15$/);
  assert.deepEqual(host.attached.map((a) => a.cwd), [chosen]);
  assert.deepEqual([last.memory.mode, last.memory.status, last.memory.workspace], ['session', 'delegated', chosen]);
  await core.dispose();
});

test('日報會話：指定的工作區資料夾不存在時不建立會話，日報退回標題清單並寫出原因', async () => {
  const missing = join(await tempDir(), 'does-not-exist');
  const { core, store, host } = await setup({ memoryWorkspace: missing });
  core.startRound('manual');
  await core.job().done;
  const last = store.state().lastRound;
  assert.equal(host.created.length, 0);
  assert.equal(last.report.usedModel, false);
  assert.match(last.report.reason, /資料夾不存在/);
  assert.equal(last.memory.status, 'failed');
  assert.equal(last.read, 1); // 文章還是有讀、日報檔還是有寫
  await core.dispose();
});
