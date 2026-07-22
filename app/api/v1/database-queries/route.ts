import { NextRequest, NextResponse } from "next/server";
import { checkDatabaseQueryRateLimit, executeDatabaseQuery } from "@/lib/database-management";
import { authenticateProjectApiKey } from "@/lib/server-management";

export const runtime = "nodejs";
function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
export async function POST(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  if (!(await checkDatabaseQueryRateLimit(apiKey.id))) return NextResponse.json({ error: "rate_limited", message: "数据库查询每个 API Key 每分钟最多 30 次" }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const value = body as Record<string, unknown>;
  if (typeof value.databaseId !== "string" || typeof value.sql !== "string" || typeof value.reason !== "string" || !value.reason.trim()) {
    return NextResponse.json({ error: "invalid_request", message: "databaseId、sql 和 reason 为必填项" }, { status: 400 });
  }
  const timeout = value.timeoutSeconds === undefined ? 15 : Number(value.timeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30) return NextResponse.json({ error: "invalid_timeout", message: "timeoutSeconds 必须在 1 到 30 之间" }, { status: 400 });
  try {
    const result = await executeDatabaseQuery({
      databaseId: value.databaseId, apiKeyId: apiKey.id, sql: value.sql, reason: value.reason,
      timeoutSeconds: timeout, remoteAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    });
    return NextResponse.json(result, { status: result.status === "rejected" ? 403 : result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: "database_query_failed", message: error instanceof Error ? error.message : "数据库查询失败" }, { status: 404 });
  }
}
