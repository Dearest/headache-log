// 头痛日记后端：托管静态站点 + 受 PIN 保护的记录同步接口（D1）。
// 同步模型：每条记录带客户端 updatedAt，服务端按「后写者赢」合并；
// synced_at 是服务端写入时间，客户端用它做增量拉取的游标。
// 每台设备在本地生成一个随机 id，随请求带上；服务端据此记录设备和打开会话（间隔超过 30 分钟算新的一次）。

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_PIN: string; // wrangler secret put APP_PIN
}

interface Entry {
  id: string;
  kind: 'headache' | 'checkin';
  day: string;
  updatedAt: number;
  deleted?: boolean;
  [key: string]: unknown;
}

const MAX_BATCH = 500;
const SESSION_GAP = 30 * 60_000;
const HEARTBEAT_CAP = 2 * 60_000;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (!checkPin(req, env)) return json({ error: 'bad_pin' }, 401);
    ctx.waitUntil(track(req, env).catch(() => {}));

    if (url.pathname === '/api/devices' && req.method === 'GET') {
      const devices = await env.DB.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all();
      const sessions = await env.DB.prepare(
        'SELECT device_id, started_at, last_at FROM sessions WHERE started_at > ? ORDER BY started_at DESC',
      ).bind(Date.now() - 30 * 86_400_000).all();
      return json({ devices: devices.results, sessions: sessions.results });
    }

    const rename = url.pathname.match(/^\/api\/devices\/([a-z0-9]{8,40})$/);
    if (rename && req.method === 'PATCH') {
      const { label } = await req.json<{ label?: string }>().catch(() => ({ label: undefined }));
      await env.DB.prepare('UPDATE devices SET label = ? WHERE id = ?').bind((label || '').slice(0, 30), rename[1]).run();
      return json({ ok: true });
    }

    if (url.pathname === '/api/entries' && req.method === 'GET') {
      const since = Number(url.searchParams.get('since') || 0);
      const { results } = await env.DB.prepare(
        'SELECT data, synced_at FROM entries WHERE synced_at > ? ORDER BY synced_at',
      ).bind(since).all<{ data: string; synced_at: number }>();
      const cursor = results.reduce((m, r) => Math.max(m, r.synced_at), since);
      return json({ entries: results.map((r) => JSON.parse(r.data)), cursor });
    }

    if (url.pathname === '/api/entries' && req.method === 'POST') {
      let body: { entries?: Entry[] };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'bad_json' }, 400);
      }
      const entries = (body.entries || []).filter(isEntry).slice(0, MAX_BATCH);
      const now = Date.now();
      const stmt = env.DB.prepare(
        `INSERT INTO entries (id, kind, day, data, updated_at, deleted, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind, day = excluded.day, data = excluded.data,
           updated_at = excluded.updated_at, deleted = excluded.deleted, synced_at = excluded.synced_at
         WHERE excluded.updated_at >= entries.updated_at`,
      );
      if (entries.length) {
        await env.DB.batch(entries.map((e) =>
          stmt.bind(e.id, e.kind, e.day, JSON.stringify(e), e.updatedAt, e.deleted ? 1 : 0, now)));
      }
      return json({ ok: true, saved: entries.map((e) => e.id) });
    }

    if (url.pathname === '/api/ping') return json({ ok: true });

    return json({ error: 'not_found' }, 404);
  },
};

async function track(req: Request, env: Env) {
  const id = req.headers.get('x-device') || '';
  if (!/^[a-z0-9]{8,40}$/.test(id)) return;
  const now = Date.now();
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);
  const standalone = req.headers.get('x-standalone') === '1' ? 1 : 0;
  const cf = (req as { cf?: { country?: string; city?: string } }).cf;
  const row = await env.DB.prepare('SELECT last_seen FROM devices WHERE id = ?').bind(id).first<{ last_seen: number }>();
  if (!row) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO devices (id, ua, standalone, country, city, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, ua, standalone, cf?.country || '', cf?.city || '', now, now),
      env.DB.prepare('INSERT INTO sessions (device_id, started_at, last_at) VALUES (?, ?, ?)').bind(id, now, now),
    ]);
    return;
  }
  const gap = now - row.last_seen;
  const meta = env.DB.prepare('UPDATE devices SET ua = ?, standalone = ?, country = ?, city = ?, last_seen = ? WHERE id = ?')
    .bind(ua, standalone, cf?.country || '', cf?.city || '', now, id);
  if (gap > SESSION_GAP) {
    await env.DB.batch([
      meta,
      env.DB.prepare('UPDATE devices SET sessions = sessions + 1 WHERE id = ?').bind(id),
      env.DB.prepare('INSERT INTO sessions (device_id, started_at, last_at) VALUES (?, ?, ?)').bind(id, now, now),
    ]);
  } else {
    await env.DB.batch([
      meta,
      env.DB.prepare('UPDATE devices SET active_ms = active_ms + ? WHERE id = ?').bind(Math.min(gap, HEARTBEAT_CAP), id),
      env.DB.prepare('UPDATE sessions SET last_at = ? WHERE id = (SELECT id FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT 1)').bind(now, id),
    ]);
  }
}

function isEntry(e: unknown): e is Entry {
  if (!e || typeof e !== 'object') return false;
  const x = e as Entry;
  return typeof x.id === 'string' && x.id.length <= 64
    && (x.kind === 'headache' || x.kind === 'checkin')
    && /^\d{4}-\d{2}-\d{2}$/.test(x.day)
    && Number.isFinite(x.updatedAt)
    && JSON.stringify(x).length < 50_000;
}

function checkPin(req: Request, env: Env) {
  const pin = (req.headers.get('x-pin') || '').trim();
  const stored = (env.APP_PIN || '').trim();
  if (!stored || pin.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < pin.length; i++) diff |= pin.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
