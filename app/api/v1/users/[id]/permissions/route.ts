import { NextRequest, NextResponse } from "next/server";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { listUsers } from "@/lib/auth";
import { listUserResourceGrants, replaceUserResourceGrants } from "@/lib/authorization";

export const runtime = "nodejs";

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function authError(error: unknown) {
  if (!(error instanceof ApiAuthenticationError)) return null;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

async function requireTarget(id: string) {
  const target = (await listUsers()).find((item) => item.id === id);
  if (!target) throw new Error("用户不存在");
  return target;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_user_id", message: "用户 ID 格式错误" }, { status: 400 });
    }
    const user = await requireTarget(id);
    const grants = await listUserResourceGrants(id);
    return NextResponse.json({
      data: {
        user,
        serverIds: grants.serverGrants.map((item) => item.serverId),
        databaseIds: grants.databaseGrants.map((item) => item.databaseId),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源权限读取失败";
    return authError(error) || NextResponse.json(
      { error: "permissions_read_failed", message },
      { status: message === "用户不存在" ? 404 : 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_user_id", message: "用户 ID 格式错误" }, { status: 400 });
    }
    const user = await requireTarget(id);
    if (user.role !== "operator") {
      return NextResponse.json(
        { error: "admin_has_implicit_access", message: "管理员默认拥有全部资源权限，不需要单独授权" },
        { status: 400 },
      );
    }
    const body = await request.json() as Record<string, unknown>;
    if (!Array.isArray(body.serverIds) || !Array.isArray(body.databaseIds)) {
      return NextResponse.json(
        { error: "invalid_request", message: "serverIds 和 databaseIds 必须是数组" },
        { status: 400 },
      );
    }
    const serverIds = body.serverIds.map((value) => {
      if (typeof value !== "string" || !validId(value)) throw new Error("服务器 ID 格式错误");
      return value;
    });
    const databaseIds = body.databaseIds.map((value) => {
      if (typeof value !== "string" || !validId(value)) throw new Error("数据库 ID 格式错误");
      return value;
    });
    await replaceUserResourceGrants({
      userId: id,
      grantedBy: apiKey.ownerUserId,
      serverIds,
      databaseIds,
    });
    const grants = await listUserResourceGrants(id);
    return NextResponse.json({
      data: {
        userId: id,
        serverIds: grants.serverGrants.map((item) => item.serverId),
        databaseIds: grants.databaseGrants.map((item) => item.databaseId),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "资源权限保存失败";
    return authError(error) || NextResponse.json(
      { error: "permissions_update_failed", message },
      { status: message === "用户不存在" ? 404 : 400 },
    );
  }
}
