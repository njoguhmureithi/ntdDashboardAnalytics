import fs from 'fs';
import path from 'path';
import pkg from 'pg';

const { Pool } = pkg;

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'analytics-events.jsonl');
const MAX_EVENTS = 200000;

/* ------------------------------------------------------------------ *
 * Postgres pool (primary store)
 * ------------------------------------------------------------------ */

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!global.__nphiAnalyticsPool) {
    global.__nphiAnalyticsPool = new Pool({
      user: process.env.ANALYTICS_PG_USER || process.env.PG_USER || 'ubuntu',
      host: process.env.ANALYTICS_PG_HOST || process.env.PG_HOST || '127.0.0.1',
      database: process.env.ANALYTICS_PG_DATABASE || 'nphi_analytics',
      password: process.env.ANALYTICS_PG_PASSWORD || process.env.PG_PASSWORD || undefined,
      port: Number(process.env.ANALYTICS_PG_PORT || 5432),
      ssl:
        (process.env.ANALYTICS_PG_HOST || process.env.PG_HOST || '127.0.0.1') === 'localhost' ||
        (process.env.ANALYTICS_PG_HOST || process.env.PG_HOST || '127.0.0.1') === '127.0.0.1'
          ? false
          : { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
  }
  pool = global.__nphiAnalyticsPool;
  return pool;
}

async function dbQuery(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ *
 * JSONL fallback (used only when Postgres is unreachable)
 * ------------------------------------------------------------------ */

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendFallback(event) {
  ensureDir();
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf8');
  cache.events = null;
}

let cache = { mtime: 0, events: null };

function readFallbackEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const stat = fs.statSync(EVENTS_FILE);
  if (cache.events && cache.mtime === stat.mtimeMs) return cache.events;

  const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
  const events = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* skip malformed line */
    }
  }
  const trimmed = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
  cache = { mtime: stat.mtimeMs, events: trimmed };
  return trimmed;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export function parseUserAgent(ua = '') {
  const s = ua.toLowerCase();
  let device = 'Desktop';
  if (/ipad|tablet|playbook|silk/.test(s)) device = 'Tablet';
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(s)) device = 'Mobile';

  let browser = 'Other';
  if (/edg\//.test(s)) browser = 'Edge';
  else if (/opr\/|opera/.test(s)) browser = 'Opera';
  else if (/chrome|crios/.test(s)) browser = 'Chrome';
  else if (/firefox|fxios/.test(s)) browser = 'Firefox';
  else if (/safari/.test(s)) browser = 'Safari';
  else if (/bot|crawler|spider/.test(s)) browser = 'Bot';

  let os = 'Other';
  if (/windows/.test(s)) os = 'Windows';
  else if (/android/.test(s)) os = 'Android';
  else if (/iphone|ipad|ipod|ios/.test(s)) os = 'iOS';
  else if (/mac os|macintosh/.test(s)) os = 'macOS';
  else if (/linux/.test(s)) os = 'Linux';

  return { device, browser, os };
}

export function referrerHost(referrer = '') {
  if (!referrer) return 'Direct';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host || 'Direct';
  } catch {
    return 'Direct';
  }
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export async function recordEvent(event) {
  try {
    await dbQuery(
      `INSERT INTO analytics_events (occurred_at, path, session_id, referrer, device, browser, os, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.t || new Date().toISOString(),
        event.p || '/',
        event.sid || 'anon',
        event.ref || 'Direct',
        event.device || 'Desktop',
        event.browser || 'Other',
        event.os || 'Other',
        event.country || 'Unknown',
      ]
    );
    return { stored: 'postgres' };
  } catch (error) {
    appendFallback(event);
    return { stored: 'jsonl', reason: error.code || error.message };
  }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

function tally(rows, total) {
  return rows.map((r) => ({
    name: r.name || 'Unknown',
    count: Number(r.count),
    share: total ? Math.round((Number(r.count) / total) * 1000) / 10 : 0,
  }));
}

async function buildStatsFromDb(rangeDays) {
  const interval = `${rangeDays} days`;

  const [totalsRes, dailyRes, hourlyRes, pagesRes, refRes, devRes, brRes, osRes, ctryRes, recentRes, allRes] =
    await Promise.all([
      dbQuery(
        `WITH scoped AS (
           SELECT session_id FROM analytics_events WHERE occurred_at >= now() - $1::interval
         ), per_session AS (
           SELECT session_id, count(*) AS n FROM scoped GROUP BY session_id
         )
         SELECT
           (SELECT count(*) FROM analytics_events WHERE occurred_at >= now() - $1::interval) AS pageviews,
           (SELECT count(*) FROM per_session) AS visitors,
           (SELECT count(*) FROM per_session WHERE n = 1) AS bounces,
           (SELECT count(*) FROM analytics_events WHERE occurred_at >= date_trunc('day', now())) AS today_views,
           (SELECT count(DISTINCT session_id) FROM analytics_events WHERE occurred_at >= date_trunc('day', now())) AS today_visitors,
           (SELECT count(DISTINCT session_id) FROM analytics_events WHERE occurred_at >= now() - interval '5 minutes') AS live_visitors`,
        [interval]
      ),
      dbQuery(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', now()) - ($1::int - 1) * interval '1 day',
             date_trunc('day', now()),
             interval '1 day'
           )::date AS d
         )
         SELECT days.d::text AS date,
                count(e.id)::int AS pageviews,
                count(DISTINCT e.session_id)::int AS visitors
         FROM days
         LEFT JOIN analytics_events e
           ON e.occurred_at >= days.d AND e.occurred_at < days.d + interval '1 day'
         GROUP BY days.d
         ORDER BY days.d`,
        [rangeDays]
      ),
      dbQuery(
        `SELECT to_char(date_trunc('hour', occurred_at), 'HH24') || ':00' AS hour,
                count(*)::int AS pageviews
         FROM analytics_events
         WHERE occurred_at >= now() - $1::interval
         GROUP BY 1 ORDER BY 1`,
        [interval]
      ),
      dbQuery(
        `SELECT path AS name, count(*)::int AS count
         FROM analytics_events WHERE occurred_at >= now() - $1::interval
         GROUP BY path ORDER BY count DESC, name LIMIT 12`,
        [interval]
      ),
      dbQuery(
        `SELECT coalesce(referrer, 'Direct') AS name, count(*)::int AS count
         FROM analytics_events WHERE occurred_at >= now() - $1::interval
         GROUP BY 1 ORDER BY count DESC, name LIMIT 10`,
        [interval]
      ),
      dbQuery(
        `SELECT coalesce(device, 'Unknown') AS name, count(*)::int AS count
         FROM analytics_events WHERE occurred_at >= now() - $1::interval
         GROUP BY 1 ORDER BY count DESC`,
        [interval]
      ),
      dbQuery(
        `SELECT coalesce(browser, 'Unknown') AS name, count(*)::int AS count
         FROM analytics_events WHERE occurred_at >= now() - $1::interval
         GROUP BY 1 ORDER BY count DESC, name LIMIT 8`,
        [interval]
      ),
      dbQuery(
        `SELECT coalesce(os, 'Unknown') AS name, count(*)::int AS count
         FROM analytics_events WHERE occurred_at >= now() - $1::interval
         GROUP BY 1 ORDER BY count DESC, name LIMIT 8`,
        [interval]
      ),
      dbQuery(
        `SELECT coalesce(country, 'Unknown') AS name, count(*)::int AS count
         FROM analytics_events WHERE occurred_at >= now() - $1::interval
         GROUP BY 1 ORDER BY count DESC, name LIMIT 10`,
        [interval]
      ),
      dbQuery(
        `SELECT occurred_at, path, coalesce(referrer, 'Direct') AS referrer,
                coalesce(device, 'Unknown') AS device, coalesce(browser, 'Unknown') AS browser,
                coalesce(os, 'Unknown') AS os, coalesce(country, 'Unknown') AS country,
                session_id
         FROM analytics_events
         WHERE occurred_at >= now() - $1::interval
         ORDER BY occurred_at DESC LIMIT 25`,
        [interval]
      ),
      dbQuery(`SELECT count(*)::int AS total FROM analytics_events`),
    ]);

  const t = totalsRes.rows[0] || {};
  const pageviews = Number(t.pageviews || 0);
  const visitors = Number(t.visitors || 0);
  const bounces = Number(t.bounces || 0);

  const hourlyMap = new Map(hourlyRes.rows.map((r) => [r.hour, Number(r.pageviews)]));
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const key = `${String(h).padStart(2, '0')}:00`;
    return { hour: key, pageviews: hourlyMap.get(key) || 0 };
  });

  return {
    range: rangeDays,
    generatedAt: new Date().toISOString(),
    storage: 'postgres',
    totals: {
      pageviews,
      visitors,
      sessions: visitors,
      pagesPerSession: visitors ? Math.round((pageviews / visitors) * 100) / 100 : 0,
      bounceRate: visitors ? Math.round((bounces / visitors) * 1000) / 10 : 0,
      todayViews: Number(t.today_views || 0),
      todayVisitors: Number(t.today_visitors || 0),
      liveVisitors: Number(t.live_visitors || 0),
      allTimeViews: Number(allRes.rows[0]?.total || 0),
    },
    dailySeries: dailyRes.rows.map((r) => ({
      date: r.date,
      pageviews: Number(r.pageviews),
      visitors: Number(r.visitors),
    })),
    hourly,
    topPages: tally(pagesRes.rows, pageviews),
    topReferrers: tally(refRes.rows, pageviews),
    devices: tally(devRes.rows, pageviews),
    browsers: tally(brRes.rows, pageviews),
    os: tally(osRes.rows, pageviews),
    countries: tally(ctryRes.rows, pageviews),
    recent: recentRes.rows.map((r) => ({
      t: new Date(r.occurred_at).toISOString(),
      path: r.path,
      referrer: r.referrer,
      device: r.device,
      browser: r.browser,
      os: r.os,
      country: r.country,
      sid: r.session_id ? String(r.session_id).slice(0, 8) : '—',
    })),
  };
}

function buildStatsFromFallback(rangeDays) {
  const events = readFallbackEvents();
  const now = Date.now();
  const startMs = now - rangeDays * 24 * 60 * 60 * 1000;
  const inRange = events.filter((e) => new Date(e.t).getTime() >= startMs);

  const pageviews = inRange.length;
  const sessions = new Set(inRange.map((e) => e.sid));
  const visitors = sessions.size;

  const perSession = new Map();
  for (const e of inRange) perSession.set(e.sid, (perSession.get(e.sid) || 0) + 1);
  const bounces = [...perSession.values()].filter((n) => n === 1).length;

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayViews = events.filter((e) => e.t.slice(0, 10) === todayKey).length;
  const todayVisitors = new Set(events.filter((e) => e.t.slice(0, 10) === todayKey).map((e) => e.sid)).size;
  const liveCutoff = now - 5 * 60 * 1000;
  const liveVisitors = new Set(
    events.filter((e) => new Date(e.t).getTime() >= liveCutoff).map((e) => e.sid)
  ).size;

  const series = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date: d, pageviews: 0, visitors: 0, _sids: new Set() });
  }
  const seriesIndex = new Map(series.map((s) => [s.date, s]));
  for (const e of inRange) {
    const bucket = seriesIndex.get(e.t.slice(0, 10));
    if (!bucket) continue;
    bucket.pageviews += 1;
    bucket._sids.add(e.sid);
  }

  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    pageviews: 0,
  }));
  for (const e of inRange) hourly[new Date(e.t).getUTCHours()].pageviews += 1;

  const tallyFn = (keyFn) => {
    const map = new Map();
    for (const e of inRange) {
      const k = keyFn(e) || 'Unknown';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({
        name,
        count,
        share: pageviews ? Math.round((count / pageviews) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    range: rangeDays,
    generatedAt: new Date().toISOString(),
    storage: 'jsonl',
    totals: {
      pageviews,
      visitors,
      sessions: visitors,
      pagesPerSession: visitors ? Math.round((pageviews / visitors) * 100) / 100 : 0,
      bounceRate: visitors ? Math.round((bounces / visitors) * 1000) / 10 : 0,
      todayViews,
      todayVisitors,
      liveVisitors,
      allTimeViews: events.length,
    },
    dailySeries: series.map((s) => ({ date: s.date, pageviews: s.pageviews, visitors: s._sids.size })),
    hourly,
    topPages: tallyFn((e) => e.p).slice(0, 12),
    topReferrers: tallyFn((e) => e.ref).slice(0, 10),
    devices: tallyFn((e) => e.device),
    browsers: tallyFn((e) => e.browser).slice(0, 8),
    os: tallyFn((e) => e.os).slice(0, 8),
    countries: tallyFn((e) => e.country).slice(0, 10),
    recent: inRange
      .slice(-25)
      .reverse()
      .map((e) => ({
        t: e.t,
        path: e.p,
        referrer: e.ref,
        device: e.device,
        browser: e.browser,
        os: e.os,
        country: e.country,
        sid: e.sid ? e.sid.slice(0, 8) : '—',
      })),
  };
}

export async function buildStats(rangeDays = 30) {
  try {
    return await buildStatsFromDb(rangeDays);
  } catch (error) {
    const fallback = buildStatsFromFallback(rangeDays);
    fallback.storage = 'jsonl';
    fallback.storageWarning = error.code || error.message;
    return fallback;
  }
}

/* ------------------------------------------------------------------ *
 * Raw event streaming (server-side export)
 * ------------------------------------------------------------------ */

const EXPORT_BATCH = 1000;

export async function* iterateEvents(rangeDays = 30) {
  const interval = `${rangeDays} days`;
  let lastId = '0';

  for (;;) {
    const res = await dbQuery(
      `SELECT id, occurred_at, path, session_id, referrer, device, browser, os, country
       FROM analytics_events
       WHERE occurred_at >= now() - $1::interval AND id > $2::bigint
       ORDER BY id ASC
       LIMIT $3`,
      [interval, lastId, EXPORT_BATCH]
    );

    if (!res.rows.length) break;
    for (const row of res.rows) yield row;
    lastId = String(res.rows[res.rows.length - 1].id);
    if (res.rows.length < EXPORT_BATCH) break;
  }
}

export function* iterateLocalEvents(rangeDays = 30) {
  const startMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  let id = 0;
  for (const e of readFallbackEvents()) {
    if (new Date(e.t).getTime() < startMs) continue;
    id += 1;
    yield {
      id,
      occurred_at: e.t,
      path: e.p,
      session_id: e.sid,
      referrer: e.ref,
      device: e.device,
      browser: e.browser,
      os: e.os,
      country: e.country,
    };
  }
}
