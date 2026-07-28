import type { ManagedDatabaseInput } from "./database-management";

export class DatabaseApiInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function trimmedString(
  input: Record<string, unknown>,
  field: string,
  maxLength: number,
  required = true,
) {
  const value = typeof input[field] === "string" ? input[field].trim() : "";
  if (required && !value) throw new DatabaseApiInputError("invalid_request", `${field} 为必填项`);
  if (value.length > maxLength) {
    throw new DatabaseApiInputError("invalid_request", `${field} 不能超过 ${maxLength} 个字符`);
  }
  return value;
}

export function parseDatabaseApiInput(body: unknown, requirePassword: boolean): ManagedDatabaseInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DatabaseApiInputError("invalid_request", "请求体格式错误");
  }
  const input = body as Record<string, unknown>;
  const name = trimmedString(input, "name", 100);
  const host = trimmedString(input, "host", 255);
  const databaseName = trimmedString(input, "databaseName", 128);
  const username = trimmedString(input, "username", 128);
  const environment = trimmedString(input, "environment", 64);
  const password = trimmedString(input, "password", 4096, false) || undefined;
  const tlsCa = trimmedString(input, "tlsCa", 128 * 1024, false) || undefined;
  const port = input.port;
  const engine = input.engine;
  const connectionMode = input.connectionMode;
  const tlsMode = input.tlsMode;
  const sshServerId = connectionMode === "sshTunnel"
    ? trimmedString(input, "sshServerId", 36)
    : null;

  if (!/^[A-Za-z0-9._:-]+$/.test(host)) {
    throw new DatabaseApiInputError("invalid_host", "数据库主机地址格式不正确");
  }
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
    throw new DatabaseApiInputError("invalid_port", "数据库端口必须是 1 到 65535 之间的整数");
  }
  if (engine !== "postgresql" && engine !== "mysql") {
    throw new DatabaseApiInputError("invalid_engine", "engine 必须是 postgresql 或 mysql");
  }
  if (connectionMode !== "direct" && connectionMode !== "sshTunnel") {
    throw new DatabaseApiInputError("invalid_connection_mode", "connectionMode 必须是 direct 或 sshTunnel");
  }
  if (sshServerId && !/^[0-9a-f-]{36}$/i.test(sshServerId)) {
    throw new DatabaseApiInputError("invalid_ssh_server_id", "SSH 隧道服务器 ID 格式错误");
  }
  if (tlsMode !== "disable" && tlsMode !== "require" && tlsMode !== "verify-full") {
    throw new DatabaseApiInputError("invalid_tls_mode", "tlsMode 必须是 disable、require 或 verify-full");
  }
  if (requirePassword && !password) {
    throw new DatabaseApiInputError("invalid_request", "创建数据库资产时必须提供密码");
  }
  if (tlsCa && (
    Buffer.byteLength(tlsCa, "utf8") > 64 * 1024
    || !tlsCa.startsWith("-----BEGIN CERTIFICATE-----")
    || !tlsCa.endsWith("-----END CERTIFICATE-----")
  )) {
    throw new DatabaseApiInputError("invalid_tls_ca", "自定义 CA 必须是小于 64 KB 的 PEM 证书");
  }

  return {
    name,
    engine,
    host,
    port: port as number,
    databaseName,
    username,
    password,
    connectionMode,
    sshServerId,
    tlsMode,
    tlsCa,
    clearTlsCa: input.clearTlsCa === true,
    environment,
  };
}
