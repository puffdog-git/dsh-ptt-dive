// 插件的執行核心：單一工作、排程、狀態。不直接依賴宿主套件，方便測試。
import { createPttReader } from './ptt.js';
import { createStore, taipeiClock, validTag } from './store.js';
import { runRound } from './round.js';
import { join, resolve as resolvePath } from 'node:path';
import { createVault } from './vault.js';
import { createPushDesk } from './pushes.js';
import { createTerminal } from './terminal.js';
import { deliverMemory, directGenerate, memoryWorkspaceChoices, memuReady, resolveMemoryWorkspace, resolveRoute, sessionGenerate, sessionServicesReady } from './host.js';

/** 建立插件的執行核心；和宿主的註冊分開，方便測試。 */
export async function createCore(ctx, { store, reader, now = Date.now, vault, terminalFactory = () => createTerminal(), deskOptions = {} } = {}) {
  store ||= await createStore();
  reader ||= createPttReader({ gapMs: () => store.config().requestGapMs, over18: () => store.config().over18 });
  let job = null;
  let lastError = '';

  const route = () => resolveRoute(ctx, store.config());
  vault ||= createVault({ file: join(store.dir, 'account.json') });
  // 推文的擬稿一律直接呼叫模型，不佔用正式會話。
  const desk = await createPushDesk({
    dir: store.dir,
    config: () => store.config(),
    vault,
    reader,
    createTerminal: terminalFactory,
    generate: ({ system, user, signal }) => directGenerate(ctx, route(), { system, user, signal }),
    styleBoards: () => store.style().boards,
    now,
    ...deskOptions,
  });
  function startRound(trigger) {
    if (job?.running) return { ok: false, error: '已經有一輪在跑' };
    if (!store.config().boards.length) return { ok: false, error: '還沒有設定要刷的看板' };
    const controller = new AbortController();
    const current = { running: true, trigger, startedAt: now(), progress: '準備中', controller };
    job = current;
    lastError = '';
    const config = store.config();
    // 「放在正式會話」與「直接寫入 memU」都會開一個正式會話；開在哪個工作區由同一個設定決定（沒填就是本插件自己的）。
    const sessionWorkspace = () => resolveMemoryWorkspace(config.memoryWorkspace, store.workspaceDir);
    // 要不要續用上一次的會話：same＝一直用同一個、day＝同一天用同一個、round＝每輪新開。
    // 只在工作區沒變時續用；記在 state.sessions（「放在正式會話」與「直接寫入 memU」各記各的）。
    const reuseKey = config.memoryDelivery;
    const today = taipeiClock(now()).date;
    const reuseFor = (cwd) => {
      const kept = store.state().sessions?.[reuseKey];
      if (!kept || config.sessionReuse === 'round' || resolvePath(kept.cwd) !== resolvePath(cwd)) return undefined;
      if (config.sessionReuse === 'day' && kept.date !== today) return undefined;
      return kept.sessionId;
    };
    const remember = (cwd) => async (sessionId) => {
      store.state().sessions = { ...(store.state().sessions || {}), [reuseKey]: { sessionId, cwd, date: today } };
      await store.saveState();
    };
    const sessionTitle = (base, date) => (config.sessionReuse === 'same' ? base : base + ' · ' + date);
    const generate = async ({ system, user, date, signal }) => {
      if (config.memoryDelivery !== 'session') return directGenerate(ctx, route(), { system, user, signal });
      let cwd;
      try {
        cwd = await sessionWorkspace();
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
      const result = await sessionGenerate(ctx, route(), { system, user, signal, cwd, title: sessionTitle('PTT 日報', date), reuseSessionId: reuseFor(cwd), onSession: remember(cwd) });
      return { ...result, workspace: cwd };
    };
    current.done = runRound({
      reader,
      store,
      generate,
      deliver: async (input) => {
        const cwd = config.memoryDelivery === 'none' ? store.workspaceDir : await sessionWorkspace();
        return deliverMemory(config.memoryDelivery, input, {
          ctx,
          route: route(),
          cwd,
          session: config.memoryDelivery === 'memu' ? { reuseSessionId: reuseFor(cwd), onSession: remember(cwd), title: sessionTitle('PTT 重點寫入記憶', input.date) } : {},
        });
      },
      draftPushes: (articles, options) => desk.draft(articles, options),
      onProgress: (text) => (current.progress = text),
      signal: controller.signal,
      now,
    })
      .then((summary) => {
        if (summary?.pushes?.created) void desk.startAuto();
        return summary;
      })
      .catch((error) => {
        lastError = controller.signal.aborted ? '已取消' : String(error?.message || error).slice(0, 200);
        return null;
      })
      .finally(() => {
        current.running = false;
        current.endedAt = now();
      });
    return { ok: true };
  }

  async function tick() {
    const config = store.config();
    if (!config.autoEnabled || job?.running) return;
    const clock = taipeiClock(now());
    if (clock.hour < config.autoHour || store.state().lastAutoDate === clock.date) return;
    store.state().lastAutoDate = clock.date;
    await store.saveState();
    startRound('auto');
  }

  async function status() {
    const style = store.style().boards;
    const r = route();
    return {
      ok: true,
      config: store.config(),
      dataDir: store.dir,
      job: job ? { running: job.running, trigger: job.trigger, startedAt: job.startedAt, endedAt: job.endedAt, progress: job.progress } : null,
      lastError,
      lastRound: store.state().lastRound,
      reader: reader.state(),
      model: r ? { provider: r.provider, model: r.model || '' } : null,
      memory: { sessionReady: sessionServicesReady(ctx), memuReady: memuReady(ctx), ownWorkspace: store.workspaceDir, workspaces: await memoryWorkspaceChoices(store.workspaceDir) },
      reports: (await store.listReports()).slice(0, 30),
      style: Object.fromEntries(Object.entries(style).map(([board, samples]) => [board, samples.length])),
      account: await vault.status(),
      pushes: desk.list(),
    };
  }

  return {
    store,
    reader,
    vault,
    desk,
    startRound,
    tick,
    status,
    /** 這個看板最近的文章標題用了哪些分類、各幾篇（只讀網頁版列表，給「挑文章」的分類選項用）。 */
    async boardTagStats(board) {
      const counts = new Map();
      let page;
      let total = 0;
      for (let i = 0; i < 2; i++) {
        const parsed = await reader.listBoard(board, { page });
        for (const e of parsed.entries) {
          if (e.pinned) continue;
          total += 1;
          if (validTag(e.tag)) counts.set(e.tag, (counts.get(e.tag) || 0) + 1);
        }
        if (!parsed.prevPage) break;
        page = parsed.prevPage;
      }
      return { ok: true, board, total, tags: [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([tag, count]) => ({ tag, count })) };
    },
    job: () => job,
    cancel() {
      if (!job?.running) return false;
      job.controller.abort();
      return true;
    },
    async dispose() {
      job?.controller.abort();
      await job?.done;
      await desk.dispose();
      await store.flush();
    },
  };
}
