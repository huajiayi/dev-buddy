import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectApiKey } from "@/lib/server-management";
import { endManagedSession } from "@/lib/managed-sessions";

export const runtime = "nodejs";

function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  try {
    const { id } = await params;
    let reason = "";
    try {
      const body = await request.json() as { reason?: unknown };
      reason = typeof body.reason === "string" ? body.reason : "";
    } catch {}
    await endManagedSession({
      sessionId: id,
      actor: { id: apiKey.ownerUserId, role: apiKey.ownerRole },
      reason,
    });
    return NextResponse.json({ data: { id, ended: true } });
  } catch (error) {
    return NextResponse.json({
      error: "managed_session_end_failed",
      message: error instanceof Error ? error.message : "托管会话结束失败",
    }, { status: 400 });
  }
}
