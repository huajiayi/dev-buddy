import { NextRequest, NextResponse } from "next/server";
import { accessibleDatabaseIds } from "@/lib/authorization";
import { listManagedDatabases, testManagedDatabase } from "@/lib/database-management";
import { authenticateProjectApiKey } from "@/lib/server-management";

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
  if (!apiKey) {
    return NextResponse.json(
      { error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" },
      { status: 401 },
    );
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_database_id", message: "数据库 ID 格式错误" }, { status: 400 });
  }
  const target = (await listManagedDatabases()).find((database) => database.id === id);
  if (!target) {
    return NextResponse.json({ error: "database_not_found", message: "数据库资产不存在" }, { status: 404 });
  }
  const ids = await accessibleDatabaseIds({ userId: apiKey.ownerUserId, role: apiKey.ownerRole });
  if (ids && !ids.has(id)) {
    return NextResponse.json({ error: "forbidden", message: "没有该数据库的访问权限" }, { status: 403 });
  }
  try {
    await testManagedDatabase(id);
    return NextResponse.json({ data: { id, name: target.name, connected: true } });
  } catch (error) {
    return NextResponse.json(
      { error: "database_test_failed", message: error instanceof Error ? error.message : "数据库连接测试失败" },
      { status: 400 },
    );
  }
}
