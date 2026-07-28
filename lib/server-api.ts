export type CreateServerApiInput = {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  credential: string;
  environment: string;
};

export type UpdateServerApiInput = Omit<CreateServerApiInput, "credential"> & {
  credential?: string;
};

export class ServerApiInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function requiredTrimmedString(
  input: Record<string, unknown>,
  field: string,
  maxLength: number,
) {
  const value = typeof input[field] === "string" ? input[field].trim() : "";
  if (!value) throw new ServerApiInputError("invalid_request", `${field} 为必填项`);
  if (value.length > maxLength) {
    throw new ServerApiInputError("invalid_request", `${field} 不能超过 ${maxLength} 个字符`);
  }
  return value;
}

function validatePrivateKey(credential: string) {
  const match = credential.match(/^-----BEGIN (?:(OPENSSH|RSA|EC|DSA) )?PRIVATE KEY-----/);
  if (!match) {
    throw new ServerApiInputError("invalid_credential", "SSH 私钥格式不正确");
  }
  const label = match[1] ? `${match[1]} PRIVATE KEY` : "PRIVATE KEY";
  if (!credential.endsWith(`-----END ${label}-----`)) {
    throw new ServerApiInputError("invalid_credential", "SSH 私钥缺少匹配的结束标记");
  }
}

function parseServerApiInput(body: unknown, requireCredential: boolean): UpdateServerApiInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ServerApiInputError("invalid_request", "请求体格式错误");
  }

  const input = body as Record<string, unknown>;
  const name = requiredTrimmedString(input, "name", 100);
  const host = requiredTrimmedString(input, "host", 255);
  const username = requiredTrimmedString(input, "username", 128);
  const environment = requiredTrimmedString(input, "environment", 64);
  const credential = typeof input.credential === "string" && input.credential.trim()
    ? input.credential.trim()
    : undefined;
  const port = input.port;
  const authType = input.authType;

  if (!/^[A-Za-z0-9._:-]+$/.test(host)) {
    throw new ServerApiInputError("invalid_host", "主机地址格式不正确");
  }
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
    throw new ServerApiInputError("invalid_port", "SSH 端口必须是 1 到 65535 之间的整数");
  }
  if (authType !== "password" && authType !== "privateKey") {
    throw new ServerApiInputError("invalid_auth_type", "authType 必须是 password 或 privateKey");
  }
  if (requireCredential && !credential) {
    throw new ServerApiInputError("invalid_request", "credential 为必填项");
  }
  if (credential && Buffer.byteLength(credential, "utf8") > 64 * 1024) {
    throw new ServerApiInputError("invalid_credential", "SSH 凭据不能超过 64 KB");
  }
  if (credential && authType === "privateKey") validatePrivateKey(credential);

  return {
    name,
    host,
    port: port as number,
    username,
    authType,
    credential,
    environment,
  };
}

export function parseCreateServerApiInput(body: unknown): CreateServerApiInput {
  return parseServerApiInput(body, true) as CreateServerApiInput;
}

export function parseUpdateServerApiInput(body: unknown): UpdateServerApiInput {
  return parseServerApiInput(body, false);
}
