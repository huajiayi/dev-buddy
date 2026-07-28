"use server";

import { revalidatePath } from "next/cache";
import { createManagedServer, removeManagedServer, setManagedServerEnabled, testManagedServer, updateManagedServer } from "@/lib/server-management";
import { requireAdmin, requirePageUser } from "@/lib/auth";
import { requireServerAccess } from "@/lib/authorization";

export type ServerInput = {
  name: string; host: string; port: number; username: string;
  authType: "password" | "privateKey"; credential?: string;
  environment: string;
};

function validateServerInput(input: ServerInput, requireCredential: boolean) {
  const name = input.name.trim();
  const host = input.host.trim();
  const username = input.username.trim();
  const environment = input.environment.trim() || "production";
  const credential = input.credential?.trim();
  if (!name || !host || !username || (requireCredential && !credential)) {
    return { error: "请填写完整的服务器和 SSH 凭证信息" } as const;
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return { error: "SSH 端口必须在 1 到 65535 之间" } as const;
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(host)) {
    return { error: "主机地址格式不正确" } as const;
  }
  return { value: { ...input, name, host, username, environment, credential } } as const;
}

export async function createServer(input: ServerInput) {
  try {
    await requireAdmin();
    const validated = validateServerInput(input, true);
    if ("error" in validated) return { ok: false, error: validated.error };
    const id = await createManagedServer({ ...validated.value, credential: validated.value.credential! });
    revalidatePath("/servers");
    revalidatePath("/");
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "服务器保存失败" };
  }
}

export async function editServer(id: string, input: ServerInput) {
  try {
    await requireAdmin();
    const validated = validateServerInput(input, false);
    if ("error" in validated) return { ok: false, error: validated.error };
    await updateManagedServer({ id, ...validated.value });
    revalidatePath("/servers");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "服务器更新失败" };
  }
}

export async function deleteServer(id: string) {
  try {
    await requireAdmin();
    await removeManagedServer(id);
    revalidatePath("/servers");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "服务器删除失败" };
  }
}

export async function toggleServer(id: string, enabled: boolean) {
  try {
    await requireAdmin();
    await setManagedServerEnabled(id, enabled);
    revalidatePath("/servers");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "服务器状态更新失败" };
  }
}

export async function testServerConnection(id: string) {
  try {
    const user = await requirePageUser();
    await requireServerAccess(user, id);
    const result = await testManagedServer(id);
    return { ok: result.exitCode === 0 && result.stdout.includes("dev-buddy-connected"), error: result.stderr || undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "SSH 连接失败" };
  }
}
