import { NextRequest, NextResponse } from "next/server";
import { accessibleServerIds } from "@/lib/authorization";
import { authenticateProjectApiKey, listManagedServers, testManagedServer } from "@/lib/server-management";

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
    return NextResponse.json({ error: "invalid_server_id", message: "服务器 ID 格式错误" }, { status: 400 });
  }
  const target = (await listManagedServers()).find((server) => server.id === id);
  if (!target) {
    return NextResponse.json({ error: "server_not_found", message: "服务器不存在" }, { status: 404 });
  }
  const ids = await accessibleServerIds({ userId: apiKey.ownerUserId, role: apiKey.ownerRole });
  if (ids && !ids.has(id)) {
    return NextResponse.json({ error: "forbidden", message: "没有该服务器的访问权限" }, { status: 403 });
  }
  try {
    const result = await testManagedServer(id);
    return NextResponse.json({
      data: {
        id,
        name: target.name,
        connected: result.exitCode === 0 && result.stdout.includes("dev-buddy-connected"),
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        error: result.stderr || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "server_test_failed", message: error instanceof Error ? error.message : "服务器连接测试失败" },
      { status: 400 },
    );
  }
}
