import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import mysql from "mysql2";
import { Client as PgClient } from "pg";
import Cursor from "pg-cursor";
import { Client as SshClient } from "ssh2";
import { ensureSchema, getPool } from "./db";
import { analyzeSql, type DatabaseEngine, type SqlAnalysis } from "./database-query-policy";
import { decryptSecret, encryptSecret } from "./secret";
import { getServerWithCredential } from "./server-management";

export type ConnectionMode = "direct" | "sshTunnel";
export type TlsMode = "disable" | "require" | "verify-full";

export type ManagedDatabase = {
  id: string;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  connectionMode: ConnectionMode;
  sshServerId: string | null;
  sshServerName: string | null;
  tlsMode: TlsMode;
  environment: string;
  enabled: boolean;
  hasCustomCa: boolean;
  createdAt: string;
};

export type ManagedDatabaseInput = Omit<ManagedDatabase, "id" | "sshServerName" | "enabled" | "hasCustomCa" | "createdAt"> & {
  password?: string;
  tlsCa?: string;
  clearTlsCa?: boolean;
};

export type DatabaseQueryExecution = {
  id: string;
  databaseId: string | null;
  databaseName: string;
  apiKeyName: string | null;
  actorUserName: string | null;
  sql: string;
  reason: string;
  status: string;
  statementType: string;
  policyDecision: "allow" | "deny";
  policyReason: string;
  columns: string[];
  rowCount: number;
  truncated: boolean;
  durationMs: number | null;
  error: string | null;
  remoteAddress: string | null;
  source: string;
  createdAt: string;
};

export type DatabaseQueryPolicy = {
  id: string;
  name: string;
  pattern: string;
  action: "allow" | "deny";
  priority: number;
  enabled: boolean;
  createdAt: string;
};

export type DatabaseObjectTable = {
  schema: string;
  name: string;
  type: "table" | "view";
};

export type DatabaseObjectColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  position: number;
};

type DatabaseCredential = { password: string; tlsCa?: string };
type DatabaseRow = {
  id: string; name: string; engine: DatabaseEngine; host: string; port: number;
  database_name: string; username: string; credential_encrypted: string;
  connection_mode: ConnectionMode; ssh_server_id: string | null; ssh_server_name: string | null;
  tls_mode: TlsMode; environment: string; enabled: boolean; created_at: Date;
};

const MAX_ROWS = 1000;
const MAX_RESULT_BYTES = 1024 * 1024;

export async function listDatabaseQueryPolicies() {
  await ensureSchema();
  const result = await getPool().query<{
    id: string; name: string; pattern: string; action: "allow" | "deny";
    priority: number; enabled: boolean; created_at: Date;
  }>("SELECT * FROM database_query_policies ORDER BY priority ASC, created_at ASC");
  return result.rows.map((row): DatabaseQueryPolicy => ({
    id: row.id, name: row.name, pattern: row.pattern, action: row.action,
    priority: row.priority, enabled: row.enabled, createdAt: row.created_at.toISOString(),
  }));
}

export async function createDatabaseQueryPolicy(input: Omit<DatabaseQueryPolicy, "id" | "createdAt">) {
  await ensureSchema();
  new RegExp(input.pattern, "i");
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO database_query_policies (id,name,pattern,action,priority,enabled)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, input.name, input.pattern, input.action, input.priority, input.enabled],
  );
  return id;
}

export async function updateDatabaseQueryPolicy(input: Omit<DatabaseQueryPolicy, "createdAt">) {
  await ensureSchema();
  new RegExp(input.pattern, "i");
  const result = await getPool().query(
    `UPDATE database_query_policies SET name=$2,pattern=$3,action=$4,priority=$5,
     enabled=$6,updated_at=NOW() WHERE id=$1`,
    [input.id, input.name, input.pattern, input.action, input.priority, input.enabled],
  );
  if (result.rowCount === 0) throw new Error("数据库 SQL 策略不存在");
}

export async function removeDatabaseQueryPolicy(id: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM database_query_policies WHERE id=$1", [id]);
}

export function decideDatabaseQuery(sql: string, analysis: SqlAnalysis, policies: DatabaseQueryPolicy[]) {
  for (const policy of policies) {
    if (policy.enabled && new RegExp(policy.pattern, "i").test(sql)) {
      return {
        allowed: policy.action === "allow",
        reason: `匹配数据库策略：${policy.name}`,
      };
    }
  }
  return analysis.readOnly
    ? { allowed: true, reason: "命中内置只读 SQL 规则" }
    : { allowed: false, reason: `${analysis.statementType || "该"}语句未匹配允许策略` };
}

export async function evaluateDatabaseQuery(sql: string, analysis: SqlAnalysis) {
  return decideDatabaseQuery(sql, analysis, await listDatabaseQueryPolicies());
}

function parseCredential(encrypted: string): DatabaseCredential {
  return JSON.parse(decryptSecret(encrypted)) as DatabaseCredential;
}

function toDatabase(row: DatabaseRow): ManagedDatabase {
  const credential = parseCredential(row.credential_encrypted);
  return {
    id: row.id, name: row.name, engine: row.engine, host: row.host, port: row.port,
    databaseName: row.database_name, username: row.username, connectionMode: row.connection_mode,
    sshServerId: row.ssh_server_id, sshServerName: row.ssh_server_name, tlsMode: row.tls_mode,
    environment: row.environment, enabled: row.enabled, hasCustomCa: Boolean(credential.tlsCa),
    createdAt: row.created_at.toISOString(),
  };
}

async function getDatabaseRow(id: string) {
  await ensureSchema();
  const result = await getPool().query<DatabaseRow>(
    `SELECT d.*, s.name AS ssh_server_name FROM managed_databases d
     LEFT JOIN managed_servers s ON s.id=d.ssh_server_id WHERE d.id=$1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listManagedDatabases(enabledOnly = false) {
  await ensureSchema();
  const result = await getPool().query<DatabaseRow>(
    `SELECT d.*, s.name AS ssh_server_name FROM managed_databases d
     LEFT JOIN managed_servers s ON s.id=d.ssh_server_id
     ${enabledOnly ? "WHERE d.enabled=TRUE" : ""}
     ORDER BY d.created_at DESC`,
  );
  return result.rows.map(toDatabase);
}

export async function createManagedDatabase(input: ManagedDatabaseInput) {
  await ensureSchema();
  if (!input.password) throw new Error("请填写数据库密码");
  const id = randomUUID();
  const encrypted = encryptSecret(JSON.stringify({ password: input.password, tlsCa: input.tlsCa || undefined } satisfies DatabaseCredential));
  await getPool().query(
    `INSERT INTO managed_databases
      (id,name,engine,host,port,database_name,username,credential_encrypted,connection_mode,ssh_server_id,tls_mode,environment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, input.name, input.engine, input.host, input.port, input.databaseName, input.username,
      encrypted, input.connectionMode, input.connectionMode === "sshTunnel" ? input.sshServerId : null,
      input.tlsMode, input.environment],
  );
  return id;
}

export async function updateManagedDatabase(id: string, input: ManagedDatabaseInput) {
  const row = await getDatabaseRow(id);
  if (!row) throw new Error("数据库资产不存在");
  const current = parseCredential(row.credential_encrypted);
  const credential: DatabaseCredential = {
    password: input.password || current.password,
    tlsCa: input.clearTlsCa ? undefined : input.tlsCa || current.tlsCa,
  };
  const encrypted = encryptSecret(JSON.stringify(credential));
  await getPool().query(
    `UPDATE managed_databases SET name=$2,engine=$3,host=$4,port=$5,database_name=$6,
      username=$7,credential_encrypted=$8,connection_mode=$9,ssh_server_id=$10,tls_mode=$11,
      environment=$12,updated_at=NOW() WHERE id=$1`,
    [id, input.name, input.engine, input.host, input.port, input.databaseName, input.username,
      encrypted, input.connectionMode, input.connectionMode === "sshTunnel" ? input.sshServerId : null,
      input.tlsMode, input.environment],
  );
}

export async function removeManagedDatabase(id: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM managed_databases WHERE id=$1", [id]);
}

export async function setManagedDatabaseEnabled(id: string, enabled: boolean) {
  await ensureSchema();
  await getPool().query("UPDATE managed_databases SET enabled=$2,updated_at=NOW() WHERE id=$1", [id, enabled]);
}

type Tunnel = { stream?: Duplex; close: () => void };

async function openTunnel(row: DatabaseRow): Promise<Tunnel> {
  if (row.connection_mode === "direct") return { close: () => undefined };
  if (!row.ssh_server_id) throw new Error("SSH 隧道服务器未配置");
  const target = await getServerWithCredential(row.ssh_server_id);
  if (!target) throw new Error("SSH 隧道服务器不存在");
  if (!target.server.enabled) throw new Error("SSH 隧道服务器已禁用");

  return new Promise((resolve, reject) => {
    const client = new SshClient();
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      client.end();
      reject(error);
    };
    client.once("error", fail);
    client.once("ready", () => {
      client.forwardOut("127.0.0.1", 0, row.host, row.port, (error, stream) => {
        if (error) return fail(error);
        settled = true;
        client.removeListener("error", fail);
        client.on("error", () => undefined);
        resolve({ stream, close: () => { stream.destroy(); client.end(); } });
      });
    });
    client.connect({
      host: target.server.host, port: target.server.port, username: target.server.username,
      readyTimeout: 15000,
      ...(target.server.authType === "password"
        ? { password: target.credential.secret }
        : { privateKey: target.credential.secret }),
    });
  });
}

function sslOptions(row: DatabaseRow, credential: DatabaseCredential) {
  if (row.tls_mode === "disable") return undefined;
  if (row.tls_mode === "require") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ca: credential.tlsCa || undefined, servername: row.host };
}

function normalizedValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `<binary ${value.length} bytes>`;
  if (Array.isArray(value)) return value.map(normalizedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizedValue(item)]));
  }
  return value;
}

type QueryOptions = {
  values?: unknown[];
  maxRows?: number;
  maxBytes?: number;
};

function appendRow(
  rows: Record<string, unknown>[],
  rowValue: Record<string, unknown>,
  bytes: { value: number },
  options: QueryOptions,
) {
  const row = normalizedValue(rowValue) as Record<string, unknown>;
  const size = Buffer.byteLength(JSON.stringify(row), "utf8") + (rows.length ? 1 : 0);
  if (
    rows.length >= (options.maxRows ?? MAX_ROWS) ||
    bytes.value + size > (options.maxBytes ?? MAX_RESULT_BYTES)
  ) return false;
  rows.push(row);
  bytes.value += size;
  return true;
}

async function queryPostgres(
  row: DatabaseRow,
  credential: DatabaseCredential,
  sql: string,
  timeoutMs: number,
  tunnel: Tunnel,
  readOnly: boolean,
  options: QueryOptions,
) {
  const client = new PgClient({
    host: tunnel.stream ? undefined : row.host, port: row.port, user: row.username,
    password: credential.password, database: row.database_name, ssl: sslOptions(row, credential),
    connectionTimeoutMillis: Math.min(timeoutMs, 15000),
    ...(tunnel.stream ? { stream: () => tunnel.stream } : {}),
  });
  const rows: Record<string, unknown>[] = [];
  const bytes = { value: 2 };
  let truncated = false;
  let cursor: Cursor | undefined;
  try {
    await client.connect();
    await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    cursor = client.query(new Cursor(sql, options.values || []));
    let finished = false;
    while (!finished) {
      const batch = await new Promise<Record<string, unknown>[]>((resolve, reject) =>
        cursor!.read(100, (error, result) => error ? reject(error) : resolve(result as Record<string, unknown>[])),
      );
      if (!batch.length) break;
      for (const item of batch) {
        if (!appendRow(rows, item, bytes, options)) {
          truncated = true;
          if (readOnly) { finished = true; break; }
        }
      }
    }
    const fields = ((cursor as unknown as { _result?: { fields?: { name: string }[] } })._result?.fields || []).map((field) => field.name);
    await new Promise<void>((resolve) => cursor!.close(() => resolve()));
    cursor = undefined;
    await client.query(readOnly ? "ROLLBACK" : "COMMIT");
    return { columns: fields.length ? fields : Object.keys(rows[0] || {}), rows, rowCount: rows.length, truncated };
  } finally {
    try { if (cursor) await new Promise<void>((resolve) => cursor!.close(() => resolve())); } catch {}
    try { await client.query("ROLLBACK"); } catch {}
    await client.end().catch(() => undefined);
  }
}

async function queryMysql(
  row: DatabaseRow,
  credential: DatabaseCredential,
  sql: string,
  timeoutMs: number,
  tunnel: Tunnel,
  readOnly: boolean,
  options: QueryOptions,
) {
  const connection = mysql.createConnection({
    host: tunnel.stream ? undefined : row.host, port: row.port, user: row.username,
    password: credential.password, database: row.database_name,
    ssl: sslOptions(row, credential), connectTimeout: Math.min(timeoutMs, 15000),
    ...(tunnel.stream ? { stream: tunnel.stream } : {}),
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: false,
  });
  const execute = (statement: string) => new Promise<void>((resolve, reject) =>
    connection.query(statement, (error) => error ? reject(error) : resolve()),
  );
  const rows: Record<string, unknown>[] = [];
  const bytes = { value: 2 };
  let truncated = false;
  let columns: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => connection.connect((error) => error ? reject(error) : resolve()));
    await execute(readOnly ? "START TRANSACTION READ ONLY" : "START TRANSACTION");
    const query = connection.query({ sql, values: options.values, timeout: timeoutMs });
    query.once("fields", (fields: { name: string }[]) => { columns = fields.map((field) => field.name); });
    const stream = query.stream({ highWaterMark: 100 });
    for await (const item of stream as AsyncIterable<Record<string, unknown>>) {
      if (!appendRow(rows, item, bytes, options)) {
        truncated = true;
        if (readOnly) {
          stream.destroy();
          break;
        }
      }
    }
    if (!truncated || !readOnly) await execute(readOnly ? "ROLLBACK" : "COMMIT");
    return { columns: columns.length ? columns : Object.keys(rows[0] || {}), rows, rowCount: rows.length, truncated };
  } finally {
    if (!truncated || !readOnly) {
      try { await execute("ROLLBACK"); } catch {}
      connection.end();
    } else {
      connection.destroy();
    }
  }
}

function sanitizedError(error: unknown) {
  const message = error instanceof Error ? error.message : "数据库操作失败";
  return message
    .replace(/(?:postgres(?:ql)?|mysql):\/\/\S+/gi, "[connection redacted]")
    .replace(/password\s*[=:]\s*\S+/gi, "password=[redacted]")
    .slice(0, 4096);
}

async function runQuery(
  row: DatabaseRow,
  sql: string,
  timeoutSeconds: number,
  readOnly: boolean,
  options: QueryOptions = {},
) {
  const credential = parseCredential(row.credential_encrypted);
  const tunnel = await openTunnel(row);
  try {
    return row.engine === "postgresql"
      ? await queryPostgres(row, credential, sql, timeoutSeconds * 1000, tunnel, readOnly, options)
      : await queryMysql(row, credential, sql, timeoutSeconds * 1000, tunnel, readOnly, options);
  } finally {
    tunnel.close();
  }
}

export async function testManagedDatabase(id: string) {
  const row = await getDatabaseRow(id);
  if (!row) throw new Error("数据库资产不存在");
  if (!row.enabled) throw new Error("数据库资产已禁用");
  return runQuery(row, "SELECT 1 AS connected", 10, true);
}

const METADATA_QUERY_OPTIONS = { maxRows: 50_000, maxBytes: 16 * 1024 * 1024 };

async function getEnabledDatabaseRow(id: string) {
  const row = await getDatabaseRow(id);
  if (!row) throw new Error("数据库资产不存在");
  if (!row.enabled) throw new Error("数据库资产已禁用");
  return row;
}

export async function listDatabaseSchemas(id: string): Promise<string[]> {
  const row = await getEnabledDatabaseRow(id);
  const sql = row.engine === "postgresql"
    ? `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog','information_schema')
         AND schema_name NOT LIKE 'pg_toast%'
         AND schema_name NOT LIKE 'pg_temp_%'
       ORDER BY schema_name`
    : `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name=DATABASE()
       ORDER BY schema_name`;
  const result = await runQuery(row, sql, 15, true, METADATA_QUERY_OPTIONS);
  return result.rows.map((item) => String(item.schema_name));
}

export async function listDatabaseTables(id: string, schema: string): Promise<DatabaseObjectTable[]> {
  const row = await getEnabledDatabaseRow(id);
  const sql = row.engine === "postgresql"
    ? `SELECT table_schema,table_name,table_type
       FROM information_schema.tables
       WHERE table_schema=$1
       ORDER BY table_name`
    : `SELECT table_schema,table_name,table_type
       FROM information_schema.tables
       WHERE table_schema=?
       ORDER BY table_name`;
  const result = await runQuery(row, sql, 15, true, {
    ...METADATA_QUERY_OPTIONS,
    values: [schema],
  });
  return result.rows.map((item) => ({
    schema: String(item.table_schema),
    name: String(item.table_name),
    type: String(item.table_type).toUpperCase().includes("VIEW") ? "view" : "table",
  }));
}

export async function listDatabaseColumns(
  id: string,
  schema: string,
  table: string,
): Promise<DatabaseObjectColumn[]> {
  const row = await getEnabledDatabaseRow(id);
  const placeholders = row.engine === "postgresql" ? ["$1", "$2"] : ["?", "?"];
  const result = await runQuery(
    row,
    `SELECT column_name,data_type,is_nullable,ordinal_position
     FROM information_schema.columns
     WHERE table_schema=${placeholders[0]} AND table_name=${placeholders[1]}
     ORDER BY ordinal_position`,
    15,
    true,
    { ...METADATA_QUERY_OPTIONS, values: [schema, table] },
  );
  return result.rows.map((item) => ({
    name: String(item.column_name),
    dataType: String(item.data_type),
    nullable: String(item.is_nullable).toUpperCase() === "YES",
    position: Number(item.ordinal_position),
  }));
}

export async function checkDatabaseQueryRateLimit(apiKeyId: string, limit = 30) {
  await ensureSchema();
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM database_query_executions
     WHERE api_key_id=$1 AND created_at > NOW() - INTERVAL '1 minute'`,
    [apiKeyId],
  );
  return Number(result.rows[0]?.count || 0) < limit;
}

export async function executeDatabaseQuery(input: {
  databaseId: string; apiKeyId?: string | null; sql: string; reason: string;
  actorUserId?: string | null; timeoutSeconds?: number; remoteAddress?: string; source?: string;
}) {
  await ensureSchema();
  const row = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.databaseId)
    ? await getDatabaseRow(input.databaseId)
    : null;
  const executionId = randomUUID();
  const startedAt = Date.now();
  const reason = input.reason.trim().slice(0, 500);
  const remoteAddress = input.remoteAddress?.slice(0, 128) || null;
  if (!row) {
    const message = "数据库资产不存在";
    await getPool().query(
      `INSERT INTO database_query_executions
       (id,database_id,api_key_id,actor_user_id,database_name,sql,reason,status,error,remote_address,
        policy_decision,policy_reason,statement_type,source,finished_at)
       VALUES ($1,NULL,$2,$3,$4,$5,$6,'rejected',$7,$8,'deny',$7,'unknown',$9,NOW())`,
      [executionId, input.apiKeyId || null, input.actorUserId || null, "未知数据库", input.sql.slice(0, 20 * 1024), reason, message, remoteAddress, input.source || "api"],
    );
    return { executionId, status: "rejected" as const, columns: [], rows: [], rowCount: 0, truncated: false, durationMs: Date.now() - startedAt, error: message };
  }
  const insertAudit = async (
    status: string,
    policyDecision: "allow" | "deny",
    policyReason: string,
    statementType: string,
    error?: string,
  ) => {
    await getPool().query(
      `INSERT INTO database_query_executions
       (id,database_id,api_key_id,actor_user_id,database_name,sql,reason,status,error,remote_address,
        policy_decision,policy_reason,statement_type,source,finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [executionId, row.id, input.apiKeyId || null, input.actorUserId || null, row.name, input.sql.slice(0, 20 * 1024), reason,
        status, error || null, remoteAddress, policyDecision, policyReason, statementType,
        input.source || "api", status === "running" ? null : new Date()],
    );
  };

  let analysis: SqlAnalysis;
  try {
    analysis = analyzeSql(input.sql, row.engine);
  } catch (error) {
    const message = sanitizedError(error);
    await insertAudit("rejected", "deny", "SQL 为空、过长、多语句或语法无法解析", "unknown", message);
    return { executionId, status: "rejected" as const, columns: [], rows: [], rowCount: 0, truncated: false, durationMs: Date.now() - startedAt, error: message };
  }
  const decision = await evaluateDatabaseQuery(analysis.sql, analysis);
  if (!decision.allowed) {
    await insertAudit("rejected", "deny", decision.reason, analysis.statementType, decision.reason);
    return {
      executionId, status: "rejected" as const, columns: [], rows: [], rowCount: 0,
      truncated: false, durationMs: Date.now() - startedAt, error: decision.reason,
      policyDecision: "deny" as const, policyReason: decision.reason,
    };
  }
  if (!row.enabled) {
    const message = "数据库资产已禁用";
    await insertAudit("rejected", "deny", message, analysis.statementType, message);
    return { executionId, status: "rejected" as const, columns: [], rows: [], rowCount: 0, truncated: false, durationMs: Date.now() - startedAt, error: message };
  }
  await insertAudit("running", "allow", decision.reason, analysis.statementType);
  const timeoutSeconds = Math.max(1, Math.min(input.timeoutSeconds || 15, 30));
  try {
    const result = await runQuery(row, analysis.sql, timeoutSeconds, analysis.readOnly);
    const durationMs = Date.now() - startedAt;
    await getPool().query(
      `UPDATE database_query_executions SET status='success',columns=$2,row_count=$3,
       truncated=$4,duration_ms=$5,finished_at=NOW() WHERE id=$1`,
      [executionId, JSON.stringify(result.columns), result.rowCount, result.truncated, durationMs],
    );
    return {
      executionId, status: "success" as const, ...result, durationMs,
      statementType: analysis.statementType, policyDecision: "allow" as const,
      policyReason: decision.reason,
    };
  } catch (error) {
    const message = sanitizedError(error);
    const durationMs = Date.now() - startedAt;
    await getPool().query(
      `UPDATE database_query_executions SET status='failed',error=$2,duration_ms=$3,finished_at=NOW() WHERE id=$1`,
      [executionId, message, durationMs],
    );
    return {
      executionId, status: "failed" as const, columns: [], rows: [], rowCount: 0,
      truncated: false, durationMs, error: message, statementType: analysis.statementType,
      policyDecision: "allow" as const, policyReason: decision.reason,
    };
  }
}

export async function listDatabaseQueryExecutions(limit = 100): Promise<DatabaseQueryExecution[]> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string; database_id: string | null; database_name: string; api_key_name: string | null; actor_user_name: string | null;
    sql: string; reason: string; status: string; columns: string[]; row_count: number;
    truncated: boolean; duration_ms: number | null; error: string | null;
    statement_type: string; policy_decision: "allow" | "deny"; policy_reason: string;
    remote_address: string | null; source: string; created_at: Date;
  }>(
    `SELECT e.*, k.name AS api_key_name, u.display_name AS actor_user_name FROM database_query_executions e
     LEFT JOIN project_api_keys k ON k.id=e.api_key_id
     LEFT JOIN app_users u ON u.id=e.actor_user_id
     ORDER BY e.created_at DESC LIMIT $1`,
    [Math.max(1, Math.min(limit, 500))],
  );
  return result.rows.map((row) => ({
    id: row.id, databaseId: row.database_id, databaseName: row.database_name,
    apiKeyName: row.api_key_name, actorUserName: row.actor_user_name, sql: row.sql, reason: row.reason, status: row.status,
    statementType: row.statement_type, policyDecision: row.policy_decision, policyReason: row.policy_reason,
    columns: row.columns, rowCount: row.row_count, truncated: row.truncated,
    durationMs: row.duration_ms, error: row.error, remoteAddress: row.remote_address, source: row.source,
    createdAt: row.created_at.toISOString(),
  }));
}
