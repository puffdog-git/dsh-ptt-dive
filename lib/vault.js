// PTT 帳號與密碼的保存。
//
// Windows：用作業系統的 DPAPI（目前登入的 Windows 使用者才能解開）加密後存檔。
// 其他系統：不寫入磁碟，只留在記憶體，DSH 重啟後要重新輸入。
// 密碼不會經由任何接口回傳，也不會出現在記錄裡。
import { spawn } from 'node:child_process';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';

function dpapi(bytes, decrypt) {
  return new Promise((resolve, reject) => {
    const script =
      "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[System.Security.Cryptography.ProtectedData]::" +
      (decrypt ? 'Unprotect' : 'Protect') +
      '($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))';
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let done = false;
    const end = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      end(Error('憑證加密服務逾時'));
    }, 10000);
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stdin.on('error', () => {});
    child.on('error', () => end(Error('無法啟動憑證加密服務')));
    child.on('close', (code) => end(code === 0 ? null : Error('無法用這個 Windows 使用者解開保存的密碼'), Buffer.from(output, 'base64')));
    child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
}

export const validPttId = (id) => /^[A-Za-z][A-Za-z0-9]{1,11}$/.test(String(id || ''));

export function createVault({ file, platform = process.platform, protect = (b) => dpapi(b, false), unprotect = (b) => dpapi(b, true) } = {}) {
  const persistent = platform === 'win32';
  let memory = null; // { id, password }
  let loaded = false;
  let loadError = '';

  async function load() {
    if (loaded) return;
    loaded = true;
    if (!persistent) return;
    let stored;
    try {
      stored = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') loadError = '保存的帳號檔讀不出來';
      return;
    }
    try {
      if (stored?.scheme !== 'dpapi-current-user' || !validPttId(stored.id)) throw Error('格式不對');
      const password = (await unprotect(Buffer.from(stored.data, 'base64'))).toString('utf8');
      if (!password) throw Error('空的');
      memory = { id: stored.id, password };
    } catch (error) {
      loadError = String(error?.message || error).includes('Windows') ? error.message : '保存的密碼解不開，請重新輸入';
    }
  }

  return {
    persistent,
    /** 給介面看的狀態：只有帳號與是否有密碼，沒有密碼本身。 */
    async status() {
      await load();
      return { id: memory?.id || '', hasPassword: !!memory?.password, persistent, error: loadError };
    },
    /** 只給連線模組用。 */
    async credentials() {
      await load();
      return memory ? { ...memory } : null;
    },
    async save(id, password) {
      await load();
      if (!validPttId(id)) throw Object.assign(Error('PTT 帳號格式不正確（英文字母開頭，2～12 個英數字）'), { status: 400 });
      const value = typeof password === 'string' ? password : '';
      if (!value) {
        // 沒填密碼：只允許在帳號沒變時沿用原本的密碼。
        if (!memory || memory.id !== id) throw Object.assign(Error('請輸入密碼'), { status: 400 });
        return;
      }
      if (value.length > 72 || /[\r\n\x00]/.test(value)) throw Object.assign(Error('密碼格式不正確'), { status: 400 });
      if (persistent) {
        const data = (await protect(Buffer.from(value, 'utf8'))).toString('base64');
        const temp = file + '.tmp-' + process.pid;
        await writeFile(temp, JSON.stringify({ scheme: 'dpapi-current-user', id, data }), 'utf8');
        await rename(temp, file);
      }
      memory = { id, password: value };
      loadError = '';
    },
    async clear() {
      await load();
      memory = null;
      loadError = '';
      if (persistent) await unlink(file).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
    },
  };
}
