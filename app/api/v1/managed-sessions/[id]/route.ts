import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectApiKey } from "@/lib/server-management";
import { listManagedSessionEvents } from "@/lib/managed-sessions";

export const runtime = "nodejs";

function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  try {
    const { id } = await params;
    const events = await listManagedSessionEvents(id, {
      id: apiKey.ownerUserId,
      role: apiKey.ownerRole,
    });
    return NextResponse.json({ data: { events } });
  } catch (error) {
    return NextResponse.json({
      error: "managed_session_read_failed",
      message: error instanceof Error ? error.message : "托管会话读取失败",
    }, { status: 404 });
  }
}
