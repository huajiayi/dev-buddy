import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import { DatabaseApiInputError, parseDatabaseApiInput } from "@/lib/database-api";
import {
  listManagedDatabases,
  removeManagedDatabase,
  setManagedDatabaseEnabled,
  updateManagedDatabase,
} from "@/lib/database-management";
import { listManagedServers } from "@/lib/server-management";

export const runtime = "nodejs";

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function authError(error: unknown) {
  if (!(error instanceof ApiAuthenticationError)) return null;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

async function targetDatabase(id: string) {
  return (await listManagedDatabases()).find((database) => database.id === id) ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApiKey(request);
    const { id } = await params;
    if (!validId(id)) {
      return NextResponse.json({ error: "invalid_database_id", message: "数据库 ID 格式错误" }, { status: 400 });
    }
    const target = await targetDatabase(id);
    if (!target) {
      return NextResponse.json({ error: "database_not_found", message: "数据库资产不存在" }, { status: 404 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).every((key) => key === "enabled") && typeof body.enabled === "boolean") {
      const confirmation = confirmationRequired(request, body.enabled ? "enable-database" : "disable-database");
      if (confirmation) return confirmation;
      await setManagedDatabaseEnabled(id, body.enabled);
      return NextResponse.json({ data: { ...target, enabled: body.enabled } });
    }

    const confirmation = confirmationRequired(request, "update-database");
    if (confirmation) return confirmation;
    const input = parseDatabaseApiInput(body, false);
    if (input.sshServerId) {
      const server = (await listManagedServers()).find((item) => item.id === input.sshServerId);
      if (!server) {
        return NextResponse.json(
          { error: "ssh_server_not_found", message: "SSH 隧道服务器不存在" },
          { status: 400 },
        );
      }
    }
    await updateManagedDatabase(id, input);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    if (error instanceof DatabaseApiInputError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return authError(error) || NextResponse.json(
      { error: "database_update_failed", message: error instanceof Error ? error.message : "数据库更新失败" },
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
      return NextResponse.json({ error: "invalid_database_id", message: "数据库 ID 格式错误" }, { status: 400 });
    }
    const target = await targetDatabase(id);
    if (!target) {
      return NextResponse.json({ error: "database_not_found", message: "数据库资产不存在" }, { status: 404 });
    }
    const confirmation = confirmationRequired(request, "delete-database");
    if (confirmation) return confirmation;
    await removeManagedDatabase(id);
    return NextResponse.json({ data: { id, name: target.name, deleted: true } });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "database_delete_failed", message: error instanceof Error ? error.message : "数据库删除失败" },
      { status: 400 },
    );
  }
}
