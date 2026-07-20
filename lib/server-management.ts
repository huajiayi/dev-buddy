import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { basename } from "node:path";
import { Client } from "ssh2";
import { ensureSchema, getPool } from "./db";
import { decryptSecret, encryptSecret } from "./secret";

export type ManagedServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  environment: string;
  enabled: boolean;
  createdAt: string;
};

export type ProjectApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CommandPolicy = {
  id: string;
  name: string;
  pattern: string;
  action: "allow" | "deny";
  priority: number;
  enabled: boolean;
  createdAt: string;
};

export type CommandExecution = {
  id: string;
  serverId: string | null;
  serverName: string | null;
  apiKeyName: string | null;
  command: string;
  reason: string;
  status: string;
  policyDecision: string;
  policyReason: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  remoteAddress: string | null;
  createdAt: string;
};

type ServerRow = {
  id: string; name: string; host: string; port: number; username: string;
  auth_type: "password" | "privateKey"; credential_encrypted: string;
  environment: string; enabled: boolean; created_at: Date;
};

type ApiKeyRow = {
  id: string; name: string; key_prefix: string; key_hash: string; scopes: string[];
  last_used_at: Date | null; expires_at: Date | null; revoked_at: Date | null; created_at: Date;
};

type PolicyRow = {
  id: string; name: string; pattern: string; action: "allow" | "deny";
  priority: number; enabled: boolean; created_at: Date;
};

type Credential = { secret: string };

const DEFAULT_ALLOWED_COMMANDS = new Set([
  "cat", "date", "df", "dmesg", "docker", "du", "free", "head", "hostname",
  "ip", "journalctl", "ls", "netstat", "ps", "pwd", "ss", "systemctl", "tail",
  "top", "uname", "uptime", "vmstat", "wc", "who", "whoami",
]);

const ALWAYS_DENIED_COMMANDS = new Set([
  "chmod", "chown", "dd", "fdisk", "iptables", "kill", "killall", "mkfs", "mount",
  "mv", "passwd", "reboot", "rm", "shutdown", "sudo", "systemctl-restart", "useradd", "userdel",
]);

const SHELL_CONTROL_PATTERN = /[;&|><\r\n\0`]|\$\(/;
const HIGH_RISK_ARGUMENT_PATTERN = /\b(systemctl\s+(?:start|stop|restart|reload|enable|disable|mask|unmask)|docker\s+(?:exec|rm|rmi|kill|stop|restart|system|compose\s+(?:up|down|restart))|journalctl\s+.*--vacuum|ip\s+(?:addr|link|route)\s+(?:add|del|set))\b/i;
const SENSITIVE_PATH_PATTERN = /(^|[\s"'])(?:\/etc\/(?:shadow|gshadow|sudoers)|\/proc\/\d+\/environ|[^\s]*(?:\.ssh\/|\.aws\/|\.config\/gcloud\/|\.kube\/config)|[^\s]*\.env(?:\s|$))/i;
const SAFE_COMMAND_SHAPES: Record<string, RegExp> = {
  date: /^date(?:\s+(?!--set\b|-s\b).*)?$/i,
  dmesg: /^dmesg(?:\s+(?!--clear\b|-c\b).*)?$/i,
  docker: /^docker\s+(?:ps|logs|inspect|stats|version|info|images)\b/i,
  hostname: /^hostname(?:\s+(?:-f|-s|-i|-I|--fqdn|--short|--ip-address|--all-ip-addresses))*$/i,
  ip: /^ip\s+(?:-br\s+)?(?:addr|address|link|route|neigh)(?:\s+(?:show|list))?(?:\s+.*)?$/i,
  journalctl: /^journalctl(?!.*(?:--vacuum|--rotate|--flush|--sync|--relinquish-var)).*$/i,
  systemctl: /^systemctl\s+(?:status|show|is-active|is-enabled|list-units|list-unit-files)\b/i,
};
const MAX_OUTPUT_BYTES = 256 * 1024;

function toServer(row: ServerRow): ManagedServer {
  return { id: row.id, name: row.name, host: row.host, port: row.port, username: row.username, authType: row.auth_type, environment: row.environment, enabled: row.enabled, createdAt: row.created_at.toISOString() };
}

function toApiKey(row: ApiKeyRow): ProjectApiKey {
  return { id: row.id, name: row.name, prefix: row.key_prefix, scopes: row.scopes, lastUsedAt: row.last_used_at?.toISOString() ?? null, expiresAt: row.expires_at?.toISOString() ?? null, revokedAt: row.revoked_at?.toISOString() ?? null, createdAt: row.created_at.toISOString() };
}

function toPolicy(row: PolicyRow): CommandPolicy {
  return { id: row.id, name: row.name, pattern: row.pattern, action: row.action, priority: row.priority, enabled: row.enabled, createdAt: row.created_at.toISOString() };
}

function keyHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function listManagedServers() {
  await ensureSchema();
  const result = await getPool().query<ServerRow>("SELECT * FROM managed_servers ORDER BY created_at DESC");
  return result.rows.map(toServer);
}

export async function createManagedServer(input: Omit<ManagedServer, "id" | "enabled" | "createdAt"> & { credential: string }) {
  await ensureSchema();
  const id = randomUUID();
  const encrypted = encryptSecret(JSON.stringify({ secret: input.credential } satisfies Credential));
  await getPool().query(
    `INSERT INTO managed_servers (id, name, host, port, username, auth_type, credential_encrypted, environment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, input.name, input.host, input.port, input.username, input.authType, encrypted, input.environment],
  );
  return id;
}

export async function updateManagedServer(input: Omit<ManagedServer, "enabled" | "createdAt"> & { credential?: string }) {
  await ensureSchema();
  const current = await getPool().query<Pick<ServerRow, "auth_type">>(
    "SELECT auth_type FROM managed_servers WHERE id = $1",
    [input.id],
  );
  const currentServer = current.rows[0];
  if (!currentServer) throw new Error("服务器不存在");
  if (currentServer.auth_type !== input.authType && !input.credential) {
    throw new Error("更换认证方式时必须填写新的密码或私钥");
  }

  const encrypted = input.credential
    ? encryptSecret(JSON.stringify({ secret: input.credential } satisfies Credential))
    : null;
  await getPool().query(
    `UPDATE managed_servers
     SET name = $2, host = $3, port = $4, username = $5, auth_type = $6,
         environment = $7, credential_encrypted = COALESCE($8, credential_encrypted),
         updated_at = NOW()
     WHERE id = $1`,
    [input.id, input.name, input.host, input.port, input.username, input.authType, input.environment, encrypted],
  );
}

export async function removeManagedServer(id: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM managed_servers WHERE id = $1", [id]);
}

export async function setManagedServerEnabled(id: string, enabled: boolean) {
  await ensureSchema();
  await getPool().query("UPDATE managed_servers SET enabled = $2, updated_at = NOW() WHERE id = $1", [id, enabled]);
}

export async function listProjectApiKeys() {
  await ensureSchema();
  const result = await getPool().query<ApiKeyRow>("SELECT * FROM project_api_keys ORDER BY created_at DESC");
  return result.rows.map(toApiKey);
}

export async function createProjectApiKey(name: string, scopes = ["commands:execute", "servers:read", "policies:read", "policies:write"]) {
  await ensureSchema();
  const value = `dbp_${randomBytes(32).toString("base64url")}`;
  const prefix = value.slice(0, 12);
  const id = randomUUID();
  await getPool().query(
    "INSERT INTO project_api_keys (id, name, key_prefix, key_hash, scopes) VALUES ($1,$2,$3,$4,$5)",
    [id, name, prefix, keyHash(value), scopes],
  );
  return { id, value };
}

export async function revokeProjectApiKey(id: string) {
  await ensureSchema();
  await getPool().query("UPDATE project_api_keys SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL", [id]);
}

export async function authenticateProjectApiKey(value: string, requiredScope: string) {
  await ensureSchema();
  const hash = keyHash(value);
  const result = await getPool().query<ApiKeyRow>("SELECT * FROM project_api_keys WHERE key_hash = $1", [hash]);
  const row = result.rows[0];
  if (!row) return null;
  const stored = Buffer.from(row.key_hash, "hex");
  const supplied = Buffer.from(hash, "hex");
  if (stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) return null;
  if (row.revoked_at || (row.expires_at && row.expires_at.getTime() <= Date.now()) || !row.scopes.includes(requiredScope)) return null;
  await getPool().query("UPDATE project_api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]);
  return toApiKey(row);
}

export async function listCommandPolicies() {
  await ensureSchema();
  const result = await getPool().query<PolicyRow>("SELECT * FROM command_policies ORDER BY priority ASC, created_at ASC");
  return result.rows.map(toPolicy);
}

export async function createCommandPolicy(input: Omit<CommandPolicy, "id" | "createdAt">) {
  await ensureSchema();
  new RegExp(input.pattern, "i");
  const id = randomUUID();
  await getPool().query(
    "INSERT INTO command_policies (id, name, pattern, action, priority, enabled) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, input.name, input.pattern, input.action, input.priority, input.enabled],
  );
  return id;
}

export async function updateCommandPolicy(input: Omit<CommandPolicy, "createdAt">) {
  await ensureSchema();
  new RegExp(input.pattern, "i");
  const result = await getPool().query(
    `UPDATE command_policies
     SET name = $2, pattern = $3, action = $4, priority = $5, enabled = $6
     WHERE id = $1`,
    [input.id, input.name, input.pattern, input.action, input.priority, input.enabled],
  );
  if (result.rowCount === 0) throw new Error("命令策略不存在");
}

export async function removeCommandPolicy(id: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM command_policies WHERE id = $1", [id]);
}

export async function evaluateCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed || trimmed.length > 2000) return { allowed: false, reason: "命令为空或超过 2000 个字符" };
  if (SHELL_CONTROL_PATTERN.test(trimmed)) return { allowed: false, reason: "最简安全模式禁止管道、重定向、命令连接或命令替换" };
  if (HIGH_RISK_ARGUMENT_PATTERN.test(trimmed)) return { allowed: false, reason: "命令包含内置高风险操作参数" };
  if (SENSITIVE_PATH_PATTERN.test(trimmed)) return { allowed: false, reason: "禁止读取敏感凭证或系统认证文件" };
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) return { allowed: false, reason: "禁止通过环境变量前缀改变命令行为" };

  const firstToken = trimmed.match(/^\s*(?:["']?)([^\s"']+)/)?.[1] ?? "";
  const executable = basename(firstToken).toLowerCase();
  if (ALWAYS_DENIED_COMMANDS.has(executable)) return { allowed: false, reason: `${executable} 属于内置高危命令` };
  const safeShape = SAFE_COMMAND_SHAPES[executable];
  if (safeShape && !safeShape.test(trimmed)) return { allowed: false, reason: `${executable} 的参数不在内置只读范围内` };

  const policies = await listCommandPolicies();
  for (const policy of policies) {
    if (!policy.enabled) continue;
    if (new RegExp(policy.pattern, "i").test(trimmed)) {
      return { allowed: policy.action === "allow", reason: `匹配策略：${policy.name}` };
    }
  }
  return DEFAULT_ALLOWED_COMMANDS.has(executable)
    ? { allowed: true, reason: `命中内置只读命令：${executable}` }
    : { allowed: false, reason: `命令 ${executable || "未知"} 不在允许列表中` };
}

async function getServerWithCredential(id: string) {
  await ensureSchema();
  const result = await getPool().query<ServerRow>("SELECT * FROM managed_servers WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  const credential = JSON.parse(decryptSecret(row.credential_encrypted)) as Credential;
  return { server: toServer(row), credential };
}

function runSshCommand(server: ManagedServer, credential: Credential, command: string, timeoutSeconds: number) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null; durationMs: number }>((resolve, reject) => {
    const client = new Client();
    const startedAt = Date.now();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`命令执行超过 ${timeoutSeconds} 秒`))), timeoutSeconds * 1000);
    client.on("ready", () => {
      client.exec(command, (error, stream) => {
        if (error) return finish(() => reject(error));
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: Buffer) => { if (Buffer.byteLength(stdout) < MAX_OUTPUT_BYTES) stdout += data.toString("utf8"); });
        stream.stderr.on("data", (data: Buffer) => { if (Buffer.byteLength(stderr) < MAX_OUTPUT_BYTES) stderr += data.toString("utf8"); });
        stream.on("close", (code: number | null) => finish(() => resolve({ stdout: stdout.slice(0, MAX_OUTPUT_BYTES), stderr: stderr.slice(0, MAX_OUTPUT_BYTES), exitCode: code, durationMs: Date.now() - startedAt })));
      });
    });
    client.on("error", (error) => finish(() => reject(error)));
    client.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: Math.min(timeoutSeconds * 1000, 15000),
      ...(server.authType === "password" ? { password: credential.secret } : { privateKey: credential.secret }),
    });
  });
}

export async function testManagedServer(id: string) {
  const target = await getServerWithCredential(id);
  if (!target) throw new Error("服务器不存在");
  return runSshCommand(target.server, target.credential, "printf dev-buddy-connected", 10);
}

export async function checkApiKeyRateLimit(apiKeyId: string, limit = 30) {
  await ensureSchema();
  const result = await getPool().query<{ count: string }>(
    "SELECT COUNT(*)::TEXT AS count FROM command_executions WHERE api_key_id=$1 AND created_at > NOW() - INTERVAL '1 minute'",
    [apiKeyId],
  );
  return Number(result.rows[0]?.count ?? 0) < limit;
}

async function insertExecution(input: { id: string; serverId: string; apiKeyId: string; command: string; reason: string; status: string; policyDecision: string; policyReason: string; remoteAddress?: string }) {
  await getPool().query(
    `INSERT INTO command_executions (id, server_id, api_key_id, command, reason, status, policy_decision, policy_reason, remote_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [input.id, input.serverId, input.apiKeyId, input.command, input.reason, input.status, input.policyDecision, input.policyReason, input.remoteAddress || null],
  );
}

export async function executeManagedCommand(input: { serverId: string; apiKeyId: string; command: string; reason?: string; timeoutSeconds?: number; remoteAddress?: string }) {
  await ensureSchema();
  const executionId = randomUUID();
  const target = await getServerWithCredential(input.serverId);
  if (!target) throw new Error("服务器不存在");
  const decision = await evaluateCommand(input.command);
  await insertExecution({ id: executionId, serverId: input.serverId, apiKeyId: input.apiKeyId, command: input.command, reason: input.reason?.slice(0, 500) || "", status: decision.allowed ? "running" : "rejected", policyDecision: decision.allowed ? "allow" : "deny", policyReason: decision.reason, remoteAddress: input.remoteAddress });
  if (!decision.allowed) return { executionId, status: "rejected", policyDecision: "deny", policyReason: decision.reason, stdout: "", stderr: "", exitCode: null, durationMs: 0 };
  if (!target.server.enabled) {
    await getPool().query("UPDATE command_executions SET status='failed', stderr=$2, finished_at=NOW() WHERE id=$1", [executionId, "服务器已禁用"]);
    return { executionId, status: "failed", policyDecision: "allow", policyReason: decision.reason, stdout: "", stderr: "服务器已禁用", exitCode: null, durationMs: 0 };
  }

  const timeoutSeconds = Math.max(1, Math.min(input.timeoutSeconds ?? 30, 60));
  try {
    const result = await runSshCommand(target.server, target.credential, input.command.trim(), timeoutSeconds);
    const status = result.exitCode === 0 ? "success" : "failed";
    await getPool().query("UPDATE command_executions SET status=$2, stdout=$3, stderr=$4, exit_code=$5, duration_ms=$6, finished_at=NOW() WHERE id=$1", [executionId, status, result.stdout, result.stderr, result.exitCode, result.durationMs]);
    return { executionId, status, policyDecision: "allow", policyReason: decision.reason, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SSH 执行失败";
    await getPool().query("UPDATE command_executions SET status='failed', stderr=$2, finished_at=NOW() WHERE id=$1", [executionId, message]);
    return { executionId, status: "failed", policyDecision: "allow", policyReason: decision.reason, stdout: "", stderr: message, exitCode: null, durationMs: null };
  }
}

export async function listCommandExecutions(limit = 100): Promise<CommandExecution[]> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string; server_id: string | null; server_name: string | null; api_key_name: string | null; command: string; reason: string;
    status: string; policy_decision: string; policy_reason: string; stdout: string; stderr: string; exit_code: number | null;
    duration_ms: number | null; remote_address: string | null; created_at: Date;
  }>(`SELECT e.*, s.name AS server_name, k.name AS api_key_name FROM command_executions e
      LEFT JOIN managed_servers s ON s.id=e.server_id LEFT JOIN project_api_keys k ON k.id=e.api_key_id
      ORDER BY e.created_at DESC LIMIT $1`, [Math.max(1, Math.min(limit, 500))]);
  return result.rows.map((row) => ({ id: row.id, serverId: row.server_id, serverName: row.server_name, apiKeyName: row.api_key_name, command: row.command, reason: row.reason, status: row.status, policyDecision: row.policy_decision, policyReason: row.policy_reason, stdout: row.stdout, stderr: row.stderr, exitCode: row.exit_code, durationMs: row.duration_ms, remoteAddress: row.remote_address, createdAt: row.created_at.toISOString() }));
}
