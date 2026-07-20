import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectApiKey, listManagedServers } from "@/lib/server-management";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request), "servers:read");
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已过期或缺少 servers:read 权限" }, { status: 401 });
  const servers = (await listManagedServers()).filter((server) => server.enabled);
  return NextResponse.json({ data: servers });
}
