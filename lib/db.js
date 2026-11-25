import pkg from 'pg';
const { Pool } = pkg;

let cachedPool;

// Pool is capped per instance to avoid exhausting PostgreSQL connection slots (e.g. on serverless).
// For further reduction, point PG_HOST/PG_PORT to a connection pooler (PgBouncer, Aiven pooler, etc.).
if (!global.pgPool) {
  global.pgPool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: 'Ntd_Wash',
    password: process.env.PG_PASSWORD,
    port: Number(process.env.PG_PORT || 22587),
    ssl: process.env.PG_HOST === 'localhost' ? false : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 8000,
  });
}

cachedPool = global.pgPool;

export async function query(text, params) {
  const client = await cachedPool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}
