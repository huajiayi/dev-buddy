import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { listUsers } from "@/lib/auth";
import { removeUser, resetUserPassword, setUserEnabled, updateUser } from "@/lib/user-management";
import { parseUserApiInput, userApiError } from "@/lib/user-api";

export const runtime = "nodejs";

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function authError(error: unknown) {
  if (!(error instanceof ApiAuthenticationError)) return null;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_user_id", message: "用户 ID 格式错误" }, { status: 400 });
    }
    const target = (await listUsers()).find((item) => item.id === id);
    if (!target) {
      return NextResponse.json({ error: "user_not_found", message: "用户不存在" }, { status: 404 });
    }
    const body = await request.json() as Record<string, unknown>;
    const input = parseUserApiInput(body, {
      username: target.username,
      displayName: target.displayName,
      email: target.email || undefined,
      role: target.role,
    });
    const securityChange = input.role !== target.role
      || (typeof body.enabled === "boolean" && body.enabled !== target.enabled)
      || Boolean(input.password);
    if (securityChange) {
      const confirmation = confirmationRequired(request, "update-user-security");
      if (confirmation) return confirmation;
    }
    await updateUser(id, input);
    if (typeof body.enabled === "boolean" && body.enabled !== target.enabled) {
      await setUserEnabled(id, body.enabled, apiKey.ownerUserId);
    }
    if (input.password) await resetUserPassword(id, input.password);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "user_update_failed", message: userApiError(error, "用户更新失败") },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_user_id", message: "用户 ID 格式错误" }, { status: 400 });
    }
    const confirmation = confirmationRequired(request, "delete-user");
    if (confirmation) return confirmation;
    await removeUser(id, apiKey.ownerUserId);
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "user_delete_failed", message: userApiError(error, "用户删除失败") },
      { status: 400 },
    );
  }
}
