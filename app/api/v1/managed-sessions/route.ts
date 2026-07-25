import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectApiKey } from "@/lib/server-management";
import { createManagedSession, listManagedSessions } from "@/lib/managed-sessions";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  try {
    const allUsers = request.nextUrl.searchParams.get("all") === "true";
    const data = await listManagedSessions(
      { id: apiKey.ownerUserId, role: apiKey.ownerRole },
      allUsers,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({
      error: "managed_sessions_list_failed",
      message: error instanceof Error ? error.message : "托管会话读取失败",
    }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "请求体不是有效 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request", message: "请求体格式错误" }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.objective !== "string" ||
    typeof value.reason !== "string" ||
    !Array.isArray(value.serverIds) ||
    !Array.isArray(value.databaseIds)
  ) {
    return NextResponse.json({
      error: "invalid_request",
      message: "objective、reason、serverIds 和 databaseIds 为必填项",
    }, { status: 400 });
  }
  try {
    const created = await createManagedSession({
      user: { id: apiKey.ownerUserId, role: apiKey.ownerRole },
      apiKeyId: apiKey.id,
      objective: value.objective,
      reason: value.reason,
      plannedActions: typeof value.plannedActions === "string" ? value.plannedActions : "",
      durationMinutes: Number(value.durationMinutes ?? 30),
      serverIds: value.serverIds.map(String),
      databaseIds: value.databaseIds.map(String),
    });
    return NextResponse.json({
      data: {
        sessionId: created.id,
        delegationToken: created.token,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: "managed_session_create_failed",
      message: error instanceof Error ? error.message : "托管会话创建失败",
    }, { status: 400 });
  }
}
