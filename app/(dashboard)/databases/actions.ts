"use server";

import { revalidatePath } from "next/cache";
import {
  createManagedDatabase, removeManagedDatabase, setManagedDatabaseEnabled,
  testManagedDatabase, updateManagedDatabase, type ManagedDatabaseInput,
} from "@/lib/database-management";
import { requireAdmin, requirePageUser } from "@/lib/auth";
import { requireDatabaseAccess } from "@/lib/authorization";

export type DatabaseInput = ManagedDatabaseInput;

function validate(input: DatabaseInput, creating: boolean) {
  const value = {
    ...input,
    name: input.name.trim(), host: input.host.trim(), databaseName: input.databaseName.trim(),
    username: input.username.trim(), environment: input.environment.trim() || "production",
    password: input.password?.trim() || undefined, tlsCa: input.tlsCa?.trim() || undefined,
    sshServerId: input.connectionMode === "sshTunnel" ? input.sshServerId : null,
  };
  if (!value.name || !value.host || !value.databaseName || !value.username || (creating && !value.password)) return { error: "请填写完整的数据库连接信息" } as const;
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return { error: "端口必须在 1 到 65535 之间" } as const;
  if (value.connectionMode === "sshTunnel" && !value.sshServerId) return { error: "请选择 SSH 隧道服务器" } as const;
  if (value.tlsCa && (Buffer.byteLength(value.tlsCa) > 64 * 1024 || !/-----BEGIN CERTIFICATE-----/.test(value.tlsCa))) return { error: "自定义 CA 必须是小于 64 KB 的 PEM 证书" } as const;
  return { value } as const;
}

export async function createDatabase(input: DatabaseInput) {
  try {
    await requireAdmin();
    const checked = validate(input, true);
    if ("error" in checked) return { ok: false, error: checked.error };
    await createManagedDatabase(checked.value);
    revalidatePath("/databases");
    revalidatePath("/");
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "数据库保存失败" }; }
}

export async function editDatabase(id: string, input: DatabaseInput) {
  try {
    await requireAdmin();
    const checked = validate(input, false);
    if ("error" in checked) return { ok: false, error: checked.error };
    await updateManagedDatabase(id, checked.value);
    revalidatePath("/databases");
    revalidatePath("/");
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "数据库更新失败" }; }
}

export async function deleteDatabase(id: string) {
  try { await requireAdmin(); await removeManagedDatabase(id); revalidatePath("/databases"); revalidatePath("/"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "数据库删除失败" }; }
}

export async function toggleDatabase(id: string, enabled: boolean) {
  try { await requireAdmin(); await setManagedDatabaseEnabled(id, enabled); revalidatePath("/databases"); revalidatePath("/"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "状态更新失败" }; }
}

export async function testDatabaseConnection(id: string) {
  try {
    const user = await requirePageUser();
    await requireDatabaseAccess(user, id, "read");
    await testManagedDatabase(id);
    return { ok: true };
  }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "连接测试失败" }; }
}
