import { NextRequest, NextResponse } from "next/server";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { accessibleServerIds } from "@/lib/authorization";
import { parseCreateServerApiInput, ServerApiInputError } from "@/lib/server-api";
import { authenticateProjectApiKey, createManagedServer, listManagedServers } from "@/lib/server-management";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  const includeDisabled = request.nextUrl.searchParams.get("includeDisabled") === "true";
  if (includeDisabled && apiKey.ownerRole !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "只有管理员可以读取已禁用服务器" },
      { status: 403 },
    );
  }
  const ids = await accessibleServerIds({ userId: apiKey.ownerUserId, role: apiKey.ownerRole });
  const servers = (await listManagedServers()).filter(
    (server) => (includeDisabled || server.enabled) && (!ids || ids.has(server.id)),
  );
  return NextResponse.json({ data: servers });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminApiKey(request);
  } catch (error) {
    if (error instanceof ApiAuthenticationError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "server_create_failed", message: "服务器创建失败" },
      { status: 500 },
    );
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "unsupported_media_type", message: "Content-Type 必须是 application/json" },
      { status: 415 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "请求体不是有效 JSON" },
      { status: 400 },
    );
  }

  try {
    const input = parseCreateServerApiInput(body);
    const existing = (await listManagedServers()).find(
      (server) => server.name === input.name
        || (
          server.host === input.host
          && server.port === input.port
          && server.username === input.username
        ),
    );
    if (existing) {
      return NextResponse.json(
        { error: "server_exists", message: "同名服务器或相同 SSH 连接已存在", data: existing },
        { status: 409 },
      );
    }

    const id = await createManagedServer(input);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof ServerApiInputError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "server_create_failed",
        message: error instanceof Error ? error.message : "服务器创建失败",
      },
      { status: 500 },
    );
  }
}
