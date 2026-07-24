"use server";

import { revalidatePath } from "next/cache";
import { createDatabaseQueryPolicy, removeDatabaseQueryPolicy, updateDatabaseQueryPolicy } from "@/lib/database-management";
import { requireAdmin } from "@/lib/auth";

export type DatabasePolicyInput = {
  name: string; pattern: string; action: "allow" | "deny"; priority: number; enabled: boolean;
};

function validate(input: DatabasePolicyInput) {
  const value = { ...input, name: input.name.trim(), pattern: input.pattern.trim(), enabled: input.enabled !== false };
  if (!value.name || !value.pattern) return { error: "请填写策略名称和正则表达式" } as const;
  if (!Number.isInteger(value.priority) || value.priority < 1 || value.priority > 100) return { error: "优先级必须在 1 到 100 之间" } as const;
  try { new RegExp(value.pattern, "i"); } catch { return { error: "正则表达式格式不正确" } as const; }
  return { value } as const;
}

export async function createPolicy(input: DatabasePolicyInput) {
  try {
    await requireAdmin();
    const checked = validate(input); if ("error" in checked) return { ok: false, error: checked.error };
    await createDatabaseQueryPolicy(checked.value); revalidatePath("/database-policies"); return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "数据库策略保存失败" }; }
}
export async function editPolicy(id: string, input: DatabasePolicyInput) {
  try {
    await requireAdmin();
    const checked = validate(input); if ("error" in checked) return { ok: false, error: checked.error };
    await updateDatabaseQueryPolicy({ id, ...checked.value }); revalidatePath("/database-policies"); return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "数据库策略更新失败" }; }
}
export async function deletePolicy(id: string) {
  try { await requireAdmin(); await removeDatabaseQueryPolicy(id); revalidatePath("/database-policies"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "数据库策略删除失败" }; }
}
