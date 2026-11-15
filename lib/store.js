// 設定、已讀紀錄、風格庫與日報的存放。資料在套件目錄之外，更新插件不會被換掉。
//
// 位置：環境變數 DSH_PTT_DIVE_DATA（絕對路徑，測試用）→ <DSH_HOME 或 ~/.dsh>/data/dsh-ptt-dive
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { validBoard } from './ptt.js';

export const DATA_ENV = 'DSH_PTT_DIVE_DATA';
export const DEFAULT_BOARDS = ['C_Chat', 'Stock', 'Baseball', 'Tech_Job'];
export const MEMORY_MODES = ['none', 'session', 'memu'];

export const DEFAULT_CONFIG = Object.freeze({
  boards: DEFAULT_BOARDS,
  keywords: [],
  readPerRound: 5,
  pagesPerBoard: 2,
  minPush: 10,
  maxAgeHours: 24,
  requestGapMs: 1500,
  dedupeDays: 7,
  over18: false,
  reportUseModel: true,
  styleEnabled: true,
  stylePerBoard: 40,
  styleMinPush: 30,
  autoEnabled: false,
  autoHour: 21,
  memoryDelivery: 'none',
  memoryWorkspace: '',
  toolsEnabled: true,
  pushEnabled: false,
  pushBoards: [],
  pushAutoBoards: [],
  pushPerRound: 2,
  pushPerDay: 5,
  pushGapSeconds: 180,
  pushAllowBoo: false,
  pushPersona: '',
  pushBlockWords: [],
  replyEnabled: false,
  replyPerDay: 1,
  replyDraftPerRound: 0,
  replyQuote: true,
  postEnabled: false,
  postPerDay: 1,
  modelProvider: '',
  modelName: '',
});

const int = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const list = (value, limit, each) => {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
  const out = [];
  for (const raw of items) {
    const item = each(String(raw ?? '').trim());
    if (item && !out.includes(item) && out.length < limit) out.push(item);
  }
  return out;
};

/** 把任意輸入整理成合法設定；不合法的值退回目前值或預設值。 */
export function normalizeConfig(input = {}, base = DEFAULT_CONFIG) {
  const pick = (key) => (input[key] === undefined ? base[key] : input[key]);
  const boards = list(pick('boards'), 20, (b) => (validBoard(b) ? b : ''));
  // 只能在有刷的看板推文。
  const pushBoards = list(pick('pushBoards'), 20, (b) => (boards.includes(b) ? b : ''));
  return {
    boards,
    keywords: list(pick('keywords'), 30, (k) => k.slice(0, 30)),
    readPerRound: int(pick('readPerRound'), 1, 15, base.readPerRound),
    pagesPerBoard: int(pick('pagesPerBoard'), 1, 5, base.pagesPerBoard),
    minPush: int(pick('minPush'), 0, 100, base.minPush),
    maxAgeHours: int(pick('maxAgeHours'), 1, 168, base.maxAgeHours),
    requestGapMs: int(pick('requestGapMs'), 500, 10000, base.requestGapMs),
    dedupeDays: int(pick('dedupeDays'), 1, 30, base.dedupeDays),
    over18: pick('over18') === true,
    reportUseModel: pick('reportUseModel') !== false,
    styleEnabled: pick('styleEnabled') !== false,
    stylePerBoard: int(pick('stylePerBoard'), 5, 100, base.stylePerBoard),
    styleMinPush: int(pick('styleMinPush'), 0, 100, base.styleMinPush),
    autoEnabled: pick('autoEnabled') === true,
    autoHour: int(pick('autoHour'), 0, 23, base.autoHour),
    memoryDelivery: MEMORY_MODES.includes(pick('memoryDelivery')) ? pick('memoryDelivery') : base.memoryDelivery,
    memoryWorkspace: String(pick('memoryWorkspace') ?? '').trim().slice(0, 400),
    toolsEnabled: pick('toolsEnabled') !== false,
    pushEnabled: pick('pushEnabled') === true,
    pushBoards,
    // 自動送出只能是允許推文的看板的子集合。
    pushAutoBoards: list(pick('pushAutoBoards'), 20, (b) => (pushBoards.includes(b) ? b : '')),
    pushPerRound: int(pick('pushPerRound'), 0, 5, base.pushPerRound),
    pushPerDay: int(pick('pushPerDay'), 1, 30, base.pushPerDay),
    pushGapSeconds: int(pick('pushGapSeconds'), 60, 3600, base.pushGapSeconds),
    pushAllowBoo: pick('pushAllowBoo') === true,
    pushPersona: String(pick('pushPersona') ?? '').trim().slice(0, 600),
    pushBlockWords: list(pick('pushBlockWords'), 50, (w) => w.slice(0, 30)),
    replyEnabled: pick('replyEnabled') === true,
    replyPerDay: int(pick('replyPerDay'), 1, 5, base.replyPerDay),
    replyDraftPerRound: int(pick('replyDraftPerRound'), 0, 2, base.replyDraftPerRound),
    replyQuote: pick('replyQuote') !== false,
    postEnabled: pick('postEnabled') === true,
    postPerDay: int(pick('postPerDay'), 1, 3, base.postPerDay),
    modelProvider: String(pick('modelProvider') ?? '').trim().slice(0, 80),
    modelName: String(pick('modelName') ?? '').trim().slice(0, 120),
  };
}

export function resolveDataDir({ env = process.env, home = homedir() } = {}) {
  const override = String(env[DATA_ENV] || '').trim();
  if (override) {
    if (!isAbsolute(override)) throw Error(DATA_ENV + ' 必須是絕對路徑');
    return resolve(override);
  }
  return join(env.DSH_HOME || join(home, '.dsh'), 'data', 'dsh-ptt-dive');
}

/** 台北時間的日期（YYYY-MM-DD）與小時。 */
export function taipeiClock(at = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), time: `${parts.hour}:${parts.minute}` };
}

export const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    // 檔案壞了：留著原檔給人看，這次用預設值。
    await rename(file, file + '.corrupt-' + Date.now()).catch(() => {});
    return fallback;
  }
}

async function writeJson(file, value) {
  const temp = file + '.tmp-' + process.pid;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, file);
}

export async function createStore({ dir = resolveDataDir(), now = Date.now } = {}) {
  await mkdir(join(dir, 'reports'), { recursive: true });
  const files = { config: join(dir, 'config.json'), state: join(dir, 'state.json'), style: join(dir, 'style.json') };
  let config = normalizeConfig(await readJson(files.config, {}));
  const state = { seen: {}, lastAutoDate: '', lastRound: null, ...(await readJson(files.state, {})) };
  const style = { boards: {}, ...(await readJson(files.style, {})) };
  let writes = Promise.resolve();
  const save = (file, value) => {
    writes = writes.catch(() => {}).then(() => writeJson(file, value));
    return writes;
  };

  return {
    dir,
    workspaceDir: join(dir, 'workspace'),
    config: () => config,
    async setConfig(patch) {
      config = normalizeConfig(patch, config);
      await save(files.config, config);
      return config;
    },
    state: () => state,
    saveState: () => save(files.state, state),
    isSeen(board, id) {
      const at = state.seen[board + '/' + id];
      return !!at && now() - at < config.dedupeDays * 86400000;
    },
    markSeen(board, id) {
      state.seen[board + '/' + id] = now();
    },
    pruneSeen() {
      const limit = now() - 30 * 86400000;
      for (const [key, at] of Object.entries(state.seen)) if (at < limit) delete state.seen[key];
    },
    style: () => style,
    saveStyle: () => save(files.style, style),
    async appendReport(date, section) {
      if (!validDate(date)) throw Error('日期格式不正確');
      const file = join(dir, 'reports', date + '.md');
      let existing = '';
      try {
        existing = await readFile(file, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const text = (existing ? existing.trimEnd() + '\n\n' : `# PTT 日報 ${date}\n\n`) + section.trim() + '\n';
      writes = writes.catch(() => {}).then(() => writeFile(file, text, 'utf8'));
      await writes;
      return file;
    },
    async listReports() {
      const names = await readdir(join(dir, 'reports')).catch(() => []);
      return names
        .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
        .map((n) => n.slice(0, 10))
        .sort()
        .reverse();
    },
    async readReport(date) {
      if (!validDate(date)) throw Error('日期格式不正確');
      try {
        return await readFile(join(dir, 'reports', date + '.md'), 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    flush: () => writes.catch(() => {}),
  };
}
