"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, type UserRole } from "@/lib/auth";
import { createUser, removeUser, resetUserPassword, setUserEnabled, updateUser } from "@/lib/user-management";

export type UserFormInput = {
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  password?: string;
};

function validateInput(input: UserFormInput, requirePassword: boolean) {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  const email = input.email?.trim() || undefined;
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) throw new Error("用户名需要为 3–64 位字母、数字、点、下划线或短横线");
  if (!displayName || displayName.length > 100) throw new Error("姓名不能为空且不能超过 100 个字符");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("邮箱格式不正确");
  if (!(["admin", "operator", "user"] as string[]).includes(input.role)) throw new Error("用户角色无效");
  if (requirePassword && !input.password) throw new Error("请设置初始密码");
  return { username, displayName, email, role: input.role, password: input.password };
}

function errorResult(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("idx_app_users_username_lower")) return "用户名已存在";
  if (message.includes("idx_app_users_email_lower")) return "邮箱已被其他用户使用";
  return message;
}

export async function createUserAction(input: UserFormInput) {
  try {
    await requireAdmin();
    const id = await createUser(validateInput(input, true));
    revalidatePath("/");
    return { ok: true, id } as const;
  } catch (error) { return { ok: false, error: errorResult(error, "用户创建失败") } as const; }
}

export async function updateUserAction(id: string, input: UserFormInput) {
  try {
    await requireAdmin();
    const value = validateInput(input, false);
    await updateUser(id, value);
    revalidatePath("/");
    return { ok: true } as const;
  } catch (error) { return { ok: false, error: errorResult(error, "用户更新失败") } as const; }
}

export async function toggleUserAction(id: string, enabled: boolean) {
  try {
    const current = await requireAdmin();
    await setUserEnabled(id, enabled, current.id);
    revalidatePath("/");
    return { ok: true } as const;
  } catch (error) { return { ok: false, error: errorResult(error, "用户状态更新失败") } as const; }
}

export async function resetPasswordAction(id: string, password: string) {
  try {
    const current = await requireAdmin();
    if (id === current.id) throw new Error("请不要在当前会话中重置自己的密码");
    await resetUserPassword(id, password);
    revalidatePath("/");
    return { ok: true } as const;
  } catch (error) { return { ok: false, error: errorResult(error, "密码重置失败") } as const; }
}

export async function deleteUserAction(id: string) {
  try {
    const current = await requireAdmin();
    await removeUser(id, current.id);
    revalidatePath("/");
    return { ok: true } as const;
  } catch (error) { return { ok: false, error: errorResult(error, "用户删除失败") } as const; }
}
