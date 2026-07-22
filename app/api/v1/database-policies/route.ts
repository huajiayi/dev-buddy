import { NextRequest, NextResponse } from "next/server";
import { createDatabaseQueryPolicy, listDatabaseQueryPolicies } from "@/lib/database-management";
import { authenticateProjectApiKey } from "@/lib/server-management";

export const runtime = "nodejs";
function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  return NextResponse.json({ data: await listDatabaseQueryPolicies() });
}

export async function POST(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const value = body as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const pattern = typeof value.pattern === "string" ? value.pattern.trim() : "";
  const action = value.action;
  const priority = Number(value.priority);
  if (!name || !pattern || (action !== "allow" && action !== "deny") || !Number.isInteger(priority) || priority < 1 || priority > 100) {
    return NextResponse.json({ error: "invalid_request", message: "name、pattern、action 和 1–100 priority 为必填项" }, { status: 400 });
  }
  try {
    new RegExp(pattern, "i");
    const id = await createDatabaseQueryPolicy({ name, pattern, action, priority, enabled: value.enabled !== false });
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "policy_create_failed", message: error instanceof Error ? error.message : "策略创建失败" }, { status: 400 });
  }
}
