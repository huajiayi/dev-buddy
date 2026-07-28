export type PolicyApiInput = {
  name: string;
  pattern: string;
  action: "allow" | "deny";
  priority: number;
  enabled: boolean;
};

export class PolicyApiInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function parsePolicyApiInput(body: unknown): PolicyApiInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PolicyApiInputError("invalid_request", "请求体格式错误");
  }
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const pattern = typeof input.pattern === "string" ? input.pattern.trim() : "";
  const action = input.action;
  const priority = Number(input.priority);
  if (!name || !pattern || (action !== "allow" && action !== "deny")) {
    throw new PolicyApiInputError("invalid_request", "name、pattern 和 allow/deny action 为必填项");
  }
  if (name.length > 100) {
    throw new PolicyApiInputError("invalid_name", "策略名称不能超过 100 个字符");
  }
  if (!Number.isInteger(priority) || priority < 1 || priority > 100) {
    throw new PolicyApiInputError("invalid_priority", "priority 必须是 1 到 100 的整数");
  }
  try {
    new RegExp(pattern, "i");
  } catch {
    throw new PolicyApiInputError("invalid_pattern", "正则表达式格式不正确");
  }
  return { name, pattern, action, priority, enabled: input.enabled !== false };
}
