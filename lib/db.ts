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
      .then(() => getPool().query(`
        CREATE TABLE IF NOT EXISTS managed_servers (
          id UUID PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          host VARCHAR(255) NOT NULL,
          port INTEGER NOT NULL DEFAULT 22 CHECK (port BETWEEN 1 AND 65535),
          username VARCHAR(100) NOT NULL,
          auth_type VARCHAR(16) NOT NULL CHECK (auth_type IN ('password', 'privateKey')),
          credential_encrypted TEXT NOT NULL,
          environment VARCHAR(32) NOT NULL DEFAULT 'production',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(host, port, username)
        );

        CREATE TABLE IF NOT EXISTS project_api_keys (
          id UUID PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          key_prefix VARCHAR(24) NOT NULL,
          key_hash CHAR(64) NOT NULL UNIQUE,
          scopes TEXT[] NOT NULL DEFAULT ARRAY['commands:execute'],
          last_used_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS command_policies (
          id UUID PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          pattern TEXT NOT NULL,
          action VARCHAR(16) NOT NULL CHECK (action IN ('allow', 'deny')),
          priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS command_executions (
          id UUID PRIMARY KEY,
          server_id UUID REFERENCES managed_servers(id) ON DELETE SET NULL,
          api_key_id UUID REFERENCES project_api_keys(id) ON DELETE SET NULL,
          command TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          status VARCHAR(16) NOT NULL,
          policy_decision VARCHAR(16) NOT NULL,
          policy_reason TEXT NOT NULL DEFAULT '',
          stdout TEXT NOT NULL DEFAULT '',
          stderr TEXT NOT NULL DEFAULT '',
          exit_code INTEGER,
          duration_ms INTEGER,
          remote_address VARCHAR(128),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_command_executions_created_at ON command_executions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_command_executions_server_id ON command_executions(server_id);
      `))
      .then(() => getPool().query(`
        ALTER TABLE managed_servers DROP COLUMN IF EXISTS tags
      `))
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}
