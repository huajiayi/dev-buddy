import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { parseUpdateServerApiInput, ServerApiInputError } from "@/lib/server-api";
import {
  listManagedServers,
  removeManagedServer,
  setManagedServerEnabled,
  updateManagedServer,
} from "@/lib/server-management";

export const runtime = "nodejs";

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function authError(error: unknown) {
  if (!(error instanceof ApiAuthenticationError)) return null;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

async function targetServer(id: string) {
  return (await listManagedServers()).find((server) => server.id === id) ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_server_id", message: "服务器 ID 格式错误" }, { status: 400 });
    }
    const target = await targetServer(id);
    if (!target) {
      return NextResponse.json({ error: "server_not_found", message: "服务器不存在" }, { status: 404 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).every((key) => key === "enabled") && typeof body.enabled === "boolean") {
      const confirmation = confirmationRequired(request, body.enabled ? "enable-server" : "disable-server");
      if (confirmation) return confirmation;
      await setManagedServerEnabled(id, body.enabled);
      return NextResponse.json({ data: { ...target, enabled: body.enabled } });
    }

    const confirmation = confirmationRequired(request, "update-server");
    if (confirmation) return confirmation;
    const input = parseUpdateServerApiInput(body);
    await updateManagedServer({ id, ...input });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    if (error instanceof ServerApiInputError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return authError(error) || NextResponse.json(
      { error: "server_update_failed", message: error instanceof Error ? error.message : "服务器更新失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_server_id", message: "服务器 ID 格式错误" }, { status: 400 });
    }
    const target = await targetServer(id);
    if (!target) {
      return NextResponse.json({ error: "server_not_found", message: "服务器不存在" }, { status: 404 });
    }
    const confirmation = confirmationRequired(request, "delete-server");
    if (confirmation) return confirmation;
    await removeManagedServer(id);
    return NextResponse.json({ data: { id, name: target.name, deleted: true } });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "server_delete_failed", message: error instanceof Error ? error.message : "服务器删除失败" },
      { status: 400 },
    );
  }
}
