import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool() {
  if (!pool) {
    const required = [
      "POSTGRESQL_HOST",
      "POSTGRESQL_PORT",
      "POSTGRESQL_USERNAME",
      "POSTGRESQL_PASSWORD",
      "POSTGRESQL_DATABASE",
    ] as const;
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) throw new Error(`缺少数据库环境变量：${missing.join(", ")}`);

    pool = new Pool({
      host: process.env.POSTGRESQL_HOST,
      port: Number(process.env.POSTGRESQL_PORT),
      user: process.env.POSTGRESQL_USERNAME,
      password: process.env.POSTGRESQL_PASSWORD,
      database: process.env.POSTGRESQL_DATABASE,
      ssl: process.env.POSTGRESQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS aliyun_accounts (
          id UUID PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          access_key_id VARCHAR(128) NOT NULL,
          access_key_secret_encrypted TEXT NOT NULL,
          site VARCHAR(16) NOT NULL DEFAULT 'china',
          regions TEXT[] NOT NULL DEFAULT ARRAY['cn-hangzhou'],
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => getPool().query(`
        ALTER TABLE aliyun_accounts
        ADD COLUMN IF NOT EXISTS site VARCHAR(16) NOT NULL DEFAULT 'china'
      `)
      )
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}
