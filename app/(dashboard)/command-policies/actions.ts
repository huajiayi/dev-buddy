"use server";

import { revalidatePath } from "next/cache";
import { createCommandPolicy, removeCommandPolicy, updateCommandPolicy } from "@/lib/server-management";
import { requireAdmin } from "@/lib/auth";

export type PolicyInput = {
  name: string;
  pattern: string;
  action: "allow" | "deny";
  priority: number;
  enabled: boolean;
};

function validatePolicyInput(input: PolicyInput) {
  const name = input.name.trim();
  const pattern = input.pattern.trim();
  if (!name || !pattern) return { error: "请填写策略名称和正则表达式" } as const;
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 100) {
    return { error: "优先级必须在 1 到 100 之间" } as const;
  }
  try {
    new RegExp(pattern, "i");
  } catch {
    return { error: "正则表达式格式不正确" } as const;
  }
  return { value: { ...input, name, pattern, enabled: input.enabled !== false } } as const;
}

export async function createPolicy(input: PolicyInput) {
  try {
    await requireAdmin();
    const validated = validatePolicyInput(input);
    if ("error" in validated) return { ok: false, error: validated.error };
    await createCommandPolicy(validated.value);
    revalidatePath("/command-policies");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "命令策略保存失败" };
  }
}

export async function editPolicy(id: string, input: PolicyInput) {
  try {
    await requireAdmin();
    const validated = validatePolicyInput(input);
    if ("error" in validated) return { ok: false, error: validated.error };
    await updateCommandPolicy({ id, ...validated.value });
    revalidatePath("/command-policies");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "命令策略更新失败" };
  }
}

export async function deletePolicy(id: string) {
  try {
    await requireAdmin();
    await removeCommandPolicy(id);
    revalidatePath("/command-policies");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "命令策略删除失败" };
  }
}
