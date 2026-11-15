// 管理用的路由一律通過宿主的登入檢查；沒有「本機就放行」之類的後門。
export async function managementRejection(req, ctx) {
  const h = req.headers || {};
  const site = h['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return 403;
  if (h.origin) {
    try {
      const u = new URL(h.origin);
      if (!['http:', 'https:'].includes(u.protocol) || u.host.toLowerCase() !== String(h.host || '').toLowerCase()) return 403;
    } catch {
      return 403;
    }
  }
  let connection;
  try {
    connection = ctx?.get?.('connection') || ctx?.connection;
  } catch {}
  if (typeof connection?.requestRejection !== 'function') return 503;
  try {
    const denied = await connection.requestRejection(req);
    if (denied !== undefined && denied !== null && denied !== false) return denied === 403 ? 403 : 401;
  } catch {
    return 401;
  }
  if (!['GET', 'HEAD'].includes(req.method) && !/^application\/json(?:\s*;|$)/i.test(String(h['content-type'] || ''))) return 415;
}

export async function readJsonBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(Error('內容太大'), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw Object.assign(Error('不是合法的 JSON'), { status: 400 });
  }
}
