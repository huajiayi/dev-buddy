import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectApiKey, createCommandPolicy, listCommandPolicies } from "@/lib/server-management";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request), "policies:read");
  if (!apiKey) {
    return NextResponse.json(
      { error: "invalid_api_key", message: "API Key 无效、已过期或缺少 policies:read 权限" },
      { status: 401 },
    );
  }
  return NextResponse.json({ data: await listCommandPolicies() });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "unsupported_media_type", message: "Content-Type 必须是 application/json" },
      { status: 415 },
    );
  }
  const apiKey = await authenticateProjectApiKey(bearerToken(request), "policies:write");
  if (!apiKey) {
    return NextResponse.json(
      { error: "invalid_api_key", message: "API Key 无效、已过期或缺少 policies:write 权限" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "请求体不是有效 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request", message: "请求体格式错误" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const pattern = typeof input.pattern === "string" ? input.pattern.trim() : "";
  const action = input.action;
  const priority = input.priority;
  const enabled = input.enabled !== false;
  if (!name || !pattern || (action !== "allow" && action !== "deny")) {
    return NextResponse.json(
      { error: "invalid_request", message: "name、pattern 以及 allow/deny action 为必填项" },
      { status: 400 },
    );
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "invalid_name", message: "策略名称不能超过 100 个字符" }, { status: 400 });
  }
  if (!Number.isInteger(priority) || (priority as number) < 1 || (priority as number) > 100) {
    return NextResponse.json({ error: "invalid_priority", message: "priority 必须是 1 到 100 的整数" }, { status: 400 });
  }
  try {
    new RegExp(pattern, "i");
  } catch {
    return NextResponse.json({ error: "invalid_pattern", message: "正则表达式格式不正确" }, { status: 400 });
  }

  const existing = (await listCommandPolicies()).find((policy) => policy.name === name);
  if (existing) {
    return NextResponse.json(
      { error: "policy_exists", message: "同名命令策略已存在", data: existing },
      { status: 409 },
    );
  }

  try {
    const id = await createCommandPolicy({ name, pattern, action, priority: priority as number, enabled });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "policy_create_failed", message: error instanceof Error ? error.message : "命令策略创建失败" },
      { status: 500 },
    );
  }
}
