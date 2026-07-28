import { NextRequest, NextResponse } from "next/server";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { DatabaseApiInputError, parseDatabaseApiInput } from "@/lib/database-api";
import { createManagedDatabase, listManagedDatabases } from "@/lib/database-management";
import { authenticateProjectApiKey, listManagedServers } from "@/lib/server-management";
import { accessibleDatabaseIds } from "@/lib/authorization";

export const runtime = "nodejs";
function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  const includeDisabled = request.nextUrl.searchParams.get("includeDisabled") === "true";
  if (includeDisabled && apiKey.ownerRole !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "只有管理员可以读取已禁用数据库" },
      { status: 403 },
    );
  }
  const ids = await accessibleDatabaseIds({ userId: apiKey.ownerUserId, role: apiKey.ownerRole });
  const data = (await listManagedDatabases(!includeDisabled)).filter((database) => !ids || ids.has(database.id)).map((database) => ({
    id: database.id, name: database.name, engine: database.engine, host: database.host,
    port: database.port, databaseName: database.databaseName, username: database.username,
    connectionMode: database.connectionMode, sshServerId: database.sshServerId,
    sshServerName: database.sshServerName, tlsMode: database.tlsMode,
    environment: database.environment, enabled: database.enabled, hasCustomCa: database.hasCustomCa,
    createdAt: database.createdAt,
  }));
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApiKey(request);
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { error: "unsupported_media_type", message: "Content-Type 必须是 application/json" },
        { status: 415 },
      );
    }
    const input = parseDatabaseApiInput(await request.json(), true);
    const existing = (await listManagedDatabases()).find(
      (database) => database.name === input.name
        || (
          database.engine === input.engine
          && database.host === input.host
          && database.port === input.port
          && database.databaseName === input.databaseName
          && database.username === input.username
        ),
    );
    if (existing) {
      return NextResponse.json(
        { error: "database_exists", message: "同名数据库或相同数据库连接已存在", data: existing },
        { status: 409 },
      );
    }
    if (input.sshServerId) {
      const server = (await listManagedServers()).find((item) => item.id === input.sshServerId);
      if (!server) {
        return NextResponse.json(
          { error: "ssh_server_not_found", message: "SSH 隧道服务器不存在" },
          { status: 400 },
        );
      }
    }
    const id = await createManagedDatabase(input);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseApiInputError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    if (error instanceof ApiAuthenticationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "database_create_failed", message: error instanceof Error ? error.message : "数据库创建失败" },
      { status: 400 },
    );
  }
}
