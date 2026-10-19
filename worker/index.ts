// 头痛日记后端：托管静态站点 + 受 PIN 保护的记录同步接口（D1）。
// 同步模型：每条记录带客户端 updatedAt，服务端按「后写者赢」合并；
// synced_at 是服务端写入时间，客户端用它做增量拉取的游标。

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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (!checkPin(req, env)) return json({ error: 'bad_pin' }, 401);

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
