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
          last_used_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
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
          source VARCHAR(32) NOT NULL DEFAULT 'api',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_command_executions_created_at ON command_executions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_command_executions_server_id ON command_executions(server_id);

        CREATE TABLE IF NOT EXISTS ssh_terminal_sessions (
          id UUID PRIMARY KEY,
          server_id UUID REFERENCES managed_servers(id) ON DELETE SET NULL,
          server_name VARCHAR(100) NOT NULL,
          status VARCHAR(24) NOT NULL,
          remote_address VARCHAR(128),
          bytes_in BIGINT NOT NULL DEFAULT 0,
          bytes_out BIGINT NOT NULL DEFAULT 0,
          close_reason TEXT,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          connected_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_ssh_terminal_sessions_started_at
          ON ssh_terminal_sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ssh_terminal_sessions_server_id
          ON ssh_terminal_sessions(server_id);
      `))
      .then(() => getPool().query(`
        ALTER TABLE managed_servers DROP COLUMN IF EXISTS tags
      `))
      .then(() => getPool().query(`
        ALTER TABLE command_executions
          ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'api'
      `))
      .then(() => getPool().query(`
        ALTER TABLE project_api_keys DROP COLUMN IF EXISTS scopes
      `))
      .then(() => getPool().query(`
        ALTER TABLE project_api_keys ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='project_api_keys' AND column_name='revoked_at'
          ) THEN
            DELETE FROM project_api_keys WHERE revoked_at IS NOT NULL;
          END IF;
        END
        $$;
        ALTER TABLE project_api_keys DROP COLUMN IF EXISTS revoked_at;
      `))
      .then(() => getPool().query(`
        CREATE TABLE IF NOT EXISTS managed_databases (
          id UUID PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          engine VARCHAR(16) NOT NULL CHECK (engine IN ('postgresql', 'mysql')),
          host VARCHAR(255) NOT NULL,
          port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
          database_name VARCHAR(128) NOT NULL,
          username VARCHAR(128) NOT NULL,
          credential_encrypted TEXT NOT NULL,
          connection_mode VARCHAR(16) NOT NULL CHECK (connection_mode IN ('direct', 'sshTunnel')),
          ssh_server_id UUID REFERENCES managed_servers(id) ON DELETE RESTRICT,
          tls_mode VARCHAR(16) NOT NULL DEFAULT 'disable' CHECK (tls_mode IN ('disable', 'require', 'verify-full')),
          environment VARCHAR(32) NOT NULL DEFAULT 'production',
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (
            (connection_mode = 'direct' AND ssh_server_id IS NULL)
            OR (connection_mode = 'sshTunnel' AND ssh_server_id IS NOT NULL)
          )
        );

        CREATE INDEX IF NOT EXISTS idx_managed_databases_ssh_server_id
          ON managed_databases(ssh_server_id);

        CREATE TABLE IF NOT EXISTS database_query_policies (
          id UUID PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          pattern TEXT NOT NULL,
          action VARCHAR(16) NOT NULL CHECK (action IN ('allow', 'deny')),
          priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS database_query_executions (
          id UUID PRIMARY KEY,
          database_id UUID REFERENCES managed_databases(id) ON DELETE SET NULL,
          api_key_id UUID REFERENCES project_api_keys(id) ON DELETE SET NULL,
          database_name VARCHAR(100) NOT NULL,
          sql TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT '',
          status VARCHAR(16) NOT NULL,
          columns JSONB NOT NULL DEFAULT '[]'::jsonb,
          row_count INTEGER NOT NULL DEFAULT 0,
          truncated BOOLEAN NOT NULL DEFAULT FALSE,
          duration_ms INTEGER,
          error TEXT,
          remote_address VARCHAR(128),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_database_query_executions_created_at
          ON database_query_executions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_database_query_executions_database_id
          ON database_query_executions(database_id);

      `))
      .then(() => getPool().query(`
        ALTER TABLE database_query_executions
          ADD COLUMN IF NOT EXISTS policy_decision VARCHAR(16) NOT NULL DEFAULT 'deny';
        ALTER TABLE database_query_executions
          ADD COLUMN IF NOT EXISTS policy_reason TEXT NOT NULL DEFAULT '';
        ALTER TABLE database_query_executions
          ADD COLUMN IF NOT EXISTS statement_type VARCHAR(32) NOT NULL DEFAULT 'unknown';
        ALTER TABLE database_query_executions
          ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'api';
        UPDATE database_query_executions
          SET policy_decision = CASE WHEN status IN ('running', 'success', 'failed') THEN 'allow' ELSE 'deny' END,
              policy_reason = '迁移前内置只读 SQL 规则'
          WHERE policy_reason = '';
      `))
      .then(() => getPool().query(`
        DROP TABLE IF EXISTS database_terminal_sessions
      `))
      .then(() => getPool().query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY,
          username VARCHAR(64) NOT NULL,
          display_name VARCHAR(100) NOT NULL,
          email VARCHAR(255),
          password_hash TEXT,
          role VARCHAR(16) NOT NULL DEFAULT 'user'
            CHECK (role IN ('admin', 'operator', 'user')),
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          lark_open_id VARCHAR(128),
          lark_union_id VARCHAR(128),
          lark_tenant_key VARCHAR(128),
          avatar_url TEXT,
          last_login_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_lower
          ON app_users (LOWER(username));
        CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower
          ON app_users (LOWER(email)) WHERE email IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_lark_union_id
          ON app_users (lark_union_id) WHERE lark_union_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS auth_sessions (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          token_hash CHAR(64) NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
          ON auth_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
          ON auth_sessions(expires_at);
      `))
      .then(() => getPool().query(`
        UPDATE app_users SET role='operator' WHERE role='user';
        ALTER TABLE app_users ALTER COLUMN role SET DEFAULT 'operator';
        ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
        ALTER TABLE app_users
          ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'operator'));

        ALTER TABLE project_api_keys
          ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;
        UPDATE project_api_keys k
          SET owner_user_id = (
            SELECT id FROM app_users
            WHERE role='admin' AND enabled=TRUE
            ORDER BY created_at ASC
            LIMIT 1
          )
          WHERE owner_user_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_project_api_keys_owner_user_id
          ON project_api_keys(owner_user_id);

        CREATE TABLE IF NOT EXISTS user_server_grants (
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          server_id UUID NOT NULL REFERENCES managed_servers(id) ON DELETE CASCADE,
          granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, server_id)
        );

        CREATE TABLE IF NOT EXISTS user_database_grants (
          user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          database_id UUID NOT NULL REFERENCES managed_databases(id) ON DELETE CASCADE,
          can_execute_sql BOOLEAN NOT NULL DEFAULT TRUE,
          granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, database_id),
          CHECK (can_execute_sql)
        );

        ALTER TABLE command_executions
          ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
        ALTER TABLE database_query_executions
          ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
        ALTER TABLE ssh_terminal_sessions
          ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
      `))
      .then(() => getPool().query(`
        ALTER TABLE user_server_grants
          DROP CONSTRAINT IF EXISTS user_server_grants_check;
        ALTER TABLE user_server_grants
          DROP COLUMN IF EXISTS can_execute_command;
        ALTER TABLE user_server_grants
          DROP COLUMN IF EXISTS can_open_ssh;
      `))
      .then(() => getPool().query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value_encrypted TEXT NOT NULL,
          updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `))
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}
