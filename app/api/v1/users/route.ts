import { NextRequest, NextResponse } from "next/server";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { listUsers } from "@/lib/auth";
import { createUser } from "@/lib/user-management";
import { parseUserApiInput, userApiError } from "@/lib/user-api";

export const runtime = "nodejs";

function authError(error: unknown) {
  if (!(error instanceof ApiAuthenticationError)) return null;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminApiKey(request);
    return NextResponse.json({ data: await listUsers() });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "users_list_failed", message: userApiError(error, "用户列表读取失败") },
      { status: 500 },
    );
  }
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
    const body = await request.json() as Record<string, unknown>;
    const input = parseUserApiInput(body);
    if (!input.password) {
      return NextResponse.json(
        { error: "password_required", message: "创建本地账号时必须设置初始密码" },
        { status: 400 },
      );
    }
    const id = await createUser(input);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "user_create_failed", message: userApiError(error, "用户创建失败") },
      { status: 400 },
    );
  }
}
