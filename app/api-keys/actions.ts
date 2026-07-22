"use server";

import { revalidatePath } from "next/cache";
import { createProjectApiKey, removeProjectApiKey, setProjectApiKeyEnabled } from "@/lib/server-management";

export async function createApiKey(nameValue: string) {
  try {
    const name = nameValue.trim();
    if (!name) return { ok: false, error: "请输入 API Key 名称" };
    const result = await createProjectApiKey(name);
    revalidatePath("/api-keys");
    return { ok: true, value: result.value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "API Key 创建失败" };
  }
}

export async function deleteApiKey(id: string) {
  try {
    await removeProjectApiKey(id);
    revalidatePath("/api-keys");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "API Key 删除失败" };
  }
}

export async function toggleApiKey(id: string, enabled: boolean) {
  try {
    await setProjectApiKeyEnabled(id, enabled);
    revalidatePath("/api-keys");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "API Key 状态更新失败" };
  }
}
