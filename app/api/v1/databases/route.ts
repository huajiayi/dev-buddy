import { NextRequest, NextResponse } from "next/server";
import { listManagedDatabases } from "@/lib/database-management";
import { authenticateProjectApiKey } from "@/lib/server-management";
import { accessibleDatabaseIds } from "@/lib/authorization";

export const runtime = "nodejs";
function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  const ids = await accessibleDatabaseIds({ userId: apiKey.ownerUserId, role: apiKey.ownerRole });
  const data = (await listManagedDatabases(true)).filter((database) => !ids || ids.has(database.id)).map((database) => ({
    id: database.id, name: database.name, engine: database.engine, host: database.host,
    port: database.port, databaseName: database.databaseName, username: database.username,
    connectionMode: database.connectionMode, sshServerId: database.sshServerId,
    sshServerName: database.sshServerName, tlsMode: database.tlsMode,
    environment: database.environment, enabled: database.enabled, createdAt: database.createdAt,
  }));
  return NextResponse.json({ data });
}
