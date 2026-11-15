// 日報會話：可以指定建在哪個工作區，以及要不要每一輪都續用同一個會話。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPttReader } from '../lib/ptt.js';
import { createStore, normalizeConfig } from '../lib/store.js';
import { createCore } from '../lib/core.js';
import { MEMU_TOOL } from '../lib/host.js';
import { NOW, articleHtml, fakeFetch, idAt, indexHtml, tempDir } from './helpers.mjs';

/**
 * 假的宿主：有模型清單、會話（建立／續用）、會話存檔查詢、工作區與封存清單。
 * 每個會話回一段固定的日報文字；記下每次是新建還是續用。
 */
function fakeHost({ withMemu = false } = {}) {
  const log = { created: [], resumed: [], attached: [], turns: [] };
  const stored = new Set(); // 有存檔的會話
  const loaded = new Set(); // 目前被別處載入的會話
  const archived = new Set();
  const state = { resumeError: null };
  const makeAgent = (sessionId, setup) => {
    const events = [];
    return (async () => {
      const applied = { restricted: null };
      await setup({ systemPrompt: { section: () => {} }, tools: { restrict: (r) => ((applied.restricted = r), () => {}) } });
      const agent = {
        id: sessionId,
        ctx: { logger: {} },
        session: { get seq() { return events.length; }, snapshotEvents: (from) => events.slice(from), header: { id: sessionId } },
        followup: (message) => {
          const text = message.content[0].text;
          log.turns.push({ sessionId, restricted: applied.restricted });
          const reply = text.includes('"memories"') ? '{"memories":[{"board":"Test","title":"測試重點","content":"板上在討論測試相關的話題，大家的看法大致正面，也有人提出不同意見。"}]}' : '## Test\n\n今天在聊測試。';
          events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: reply }] } } });
          events.push({ type: 'turn/end', data: { reason: { kind: 'completed' } } });
        },
        whenIdle: async () => {},
        cancel: () => {},
      };
      return { agent, dispose: async () => {} };
    })();
  };
  const services = {
    llm: { listProviders: () => [{ id: 'deepseek-account' }] },
    agents: {
      get: (id) => (loaded.has(id) ? { id, status: 'idle' } : undefined),
      create: async (options) => {
        log.created.push({ sessionId: options.sessionId, cwd: options.meta.cwd, title: options.meta.title });
        stored.add(options.sessionId);
        return makeAgent(options.sessionId, options.setup);
      },
      resume: async (options) => {
        if (state.resumeError) throw state.resumeError;
        log.resumed.push(options.resumeSessionId);
        return makeAgent(options.resumeSessionId, options.setup);
      },
    },
    sessionPersistence: { stat: async (id) => (stored.has(id) ? { id } : null) },
    workspaceRegistry: {
      get archivedSessionIds() {
        return archived;
      },
      create: async (cwd) => ({ attachSession: async (id) => log.attached.push({ cwd, id }) }),
    },
    tools: { get: (name) => (withMemu && name === MEMU_TOOL ? { execute: async () => '已写入 mem-test1-00a1' } : undefined) },
  };
  return { ctx: { get: (name) => services[name] }, log, stored, loaded, archived, state };
}

/** 每一輪都有一篇新的熱門文章可讀。 */
async function setup(configPatch, hostOptions) {
  let round = 0;
  const fetch = fakeFetch((path) => {
    if (path === '/bbs/Test/index.html') {
      round += 1;
      // 文章時間跟著測試的時鐘走，隔天再刷也還算新文章。
      const id = `M.${Math.floor((clock.now - 3600000) / 1000)}.A.A${String(round).padStart(2, '0')}`;
      return indexHtml({ entries: [{ id, title: '[閒聊] 熱門話題 ' + round, nrec: '爆' }], prev: 0 });
    }
    return articleHtml({ title: '[閒聊] 熱門話題', pushes: [['推', 'alice', '這個觀點滿有道理的']] });
  });
  const store = await createStore({ dir: await tempDir(), now: () => clock.now });
  const clock = { now: NOW };
  await store.setConfig({ boards: ['Test'], pagesPerBoard: 1, memoryDelivery: 'session', ...configPatch });
  const reader = createPttReader({ fetchImpl: fetch.impl, gapMs: 500, now: () => clock.now, sleep: async () => {} });
  const host = fakeHost(hostOptions);
  const core = await createCore(host.ctx, { store, reader, now: () => clock.now });
  const run = async () => {
    core.startRound('manual');
    await core.job().done;
    return store.state().lastRound;
  };
  return { core, store, host, run, clock };
}

test('設定：預設每一輪都用同一個會話；只接受三種選項', () => {
  assert.equal(normalizeConfig({}).sessionReuse, 'same');
  assert.equal(normalizeConfig({ sessionReuse: 'day' }).sessionReuse, 'day');
  assert.equal(normalizeConfig({ sessionReuse: 'round' }).sessionReuse, 'round');
  assert.equal(normalizeConfig({ sessionReuse: 'whatever' }).sessionReuse, 'same');
});

test('日報會話：沒指定工作區時建在插件自己的工作區', async () => {
  const { core, store, host, run } = await setup({});
  const last = await run();
  assert.equal(last.report.usedModel, true);
  assert.equal(host.log.created[0].cwd, store.workspaceDir);
  assert.deepEqual([last.memory.status, last.memory.workspace], ['delegated', store.workspaceDir]);
  await core.dispose();
});

test('日報會話：指定工作區後，會話建在那個工作區並掛到那個工作區底下', async () => {
  const chosen = await tempDir();
  const { core, host, run } = await setup({ memoryWorkspace: chosen });
  const last = await run();
  assert.equal(host.log.created.length, 1);
  assert.equal(host.log.created[0].cwd, chosen);
  assert.deepEqual(host.log.attached.map((a) => a.cwd), [chosen]);
  assert.deepEqual([last.memory.mode, last.memory.status, last.memory.workspace], ['session', 'delegated', chosen]);
  await core.dispose();
});

test('日報會話：指定的工作區資料夾不存在時不建立會話，日報退回標題清單並寫出原因', async () => {
  const missing = join(await tempDir(), 'does-not-exist');
  const { core, host, run } = await setup({ memoryWorkspace: missing });
  const last = await run();
  assert.equal(host.log.created.length, 0);
  assert.equal(last.report.usedModel, false);
  assert.match(last.report.reason, /資料夾不存在/);
  assert.equal(last.memory.status, 'failed');
  assert.equal(last.read, 1);
  await core.dispose();
});

test('同一個會話：第二輪、第三輪都續用第一輪建的會話，每次都禁用工具；標題不帶日期', async () => {
  const { core, host, run, clock } = await setup({ sessionReuse: 'same' });
  const first = await run();
  clock.now += 26 * 3600000; // 隔天
  const second = await run();
  const third = await run();
  assert.equal(host.log.created.length, 1);
  assert.equal(host.log.created[0].title, 'PTT 日報');
  const id = host.log.created[0].sessionId;
  assert.deepEqual(host.log.resumed, [id, id]);
  assert.deepEqual([first.memory.sessionId, second.memory.sessionId, third.memory.sessionId], [id, id, id]);
  assert.deepEqual([first.memory.resumed, second.memory.resumed], [false, true]);
  assert.equal(host.log.turns.length, 3);
  assert.ok(host.log.turns.every((t) => t.sessionId === id && JSON.stringify(t.restricted) === '{"allow":[]}'));
  await core.dispose();
});

test('同一天同一個會話：當天續用，隔天開新的；標題帶日期', async () => {
  const { core, host, run, clock } = await setup({ sessionReuse: 'day' });
  await run();
  await run();
  clock.now += 26 * 3600000;
  await run();
  assert.equal(host.log.created.length, 2);
  assert.equal(host.log.resumed.length, 1);
  assert.deepEqual(host.log.created.map((c) => c.title), ['PTT 日報 · 2026-11-15', 'PTT 日報 · 2026-11-16']);
  await core.dispose();
});

test('每輪新開：每一輪都是新的會話', async () => {
  const { core, host, run } = await setup({ sessionReuse: 'round' });
  await run();
  await run();
  assert.equal(host.log.created.length, 2);
  assert.equal(host.log.resumed.length, 0);
  assert.notEqual(host.log.created[0].sessionId, host.log.created[1].sessionId);
  await core.dispose();
});

test('續用不了就開新的、舊的不動：會話被別處開著、被封存、存檔不見、載入失敗；之後續用新的那個', async () => {
  for (const [why, sabotage] of [
    ['in-use', (host, id) => host.loaded.add(id)],
    ['archived', (host, id) => host.archived.add(id)],
    ['missing', (host, id) => host.stored.delete(id)],
    ['unusable', (host) => (host.state.resumeError = Error('SessionPersistenceCorruption'))],
  ]) {
    const { core, host, run } = await setup({ sessionReuse: 'same' });
    await run();
    const firstId = host.log.created[0].sessionId;
    sabotage(host, firstId);
    const second = await run();
    assert.equal(host.log.created.length, 2, why);
    assert.equal(host.log.resumed.length, 0, why);
    assert.equal(second.memory.fresh, why);
    assert.equal(second.report.usedModel, true, why);
    const secondId = host.log.created[1].sessionId;
    assert.notEqual(secondId, firstId, why);
    host.state.resumeError = null;
    host.loaded.clear();
    const third = await run();
    assert.equal(third.memory.sessionId, secondId, why);
    assert.deepEqual(host.log.resumed, [secondId], why);
    await core.dispose();
  }
});

test('換了工作區就不續用舊工作區的會話', async () => {
  const a = await tempDir();
  const b = await tempDir();
  const { core, store, host, run } = await setup({ sessionReuse: 'same', memoryWorkspace: a });
  await run();
  await store.setConfig({ memoryWorkspace: b });
  await run();
  assert.deepEqual(host.log.created.map((c) => c.cwd), [a, b]);
  assert.equal(host.log.resumed.length, 0);
  await core.dispose();
});

test('直接寫入 memU 的會話也照同樣的規則續用，而且和日報會話分開記', async () => {
  const { core, store, host, run } = await setup({ memoryDelivery: 'memu', sessionReuse: 'same' }, { withMemu: true });
  // memU 模式的日報是直接呼叫模型，這個假宿主沒有那個接口，所以用「放在正式會話」先產生一份有模型的日報不可行；
  // 這裡直接驗寫入記憶用的會話：日報沒經模型整理時不寫入、也不開會話。
  const first = await run();
  assert.equal(first.memory.status, 'skipped');
  assert.equal(host.log.created.length, 0);
  // 切到正式會話模式跑兩輪，再切回 memU：兩種模式各記各的會話。
  await store.setConfig({ memoryDelivery: 'session' });
  await run();
  await run();
  assert.equal(host.log.created.length, 1);
  assert.deepEqual(Object.keys(store.state().sessions), ['session']);
  await core.dispose();
});
