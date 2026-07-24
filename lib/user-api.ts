import "server-only";

import type { UserRole } from "./auth";

export type UserApiInput = {
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  password?: string;
};

export function parseUserApiInput(
  input: Record<string, unknown>,
  defaults?: Omit<UserApiInput, "password">,
) {
  const username = typeof input.username === "string" ? input.username.trim() : defaults?.username || "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : defaults?.displayName || "";
  const email = typeof input.email === "string"
    ? input.email.trim() || undefined
    : defaults?.email;
  const role = input.role === undefined ? defaults?.role : input.role;
  const password = typeof input.password === "string" ? input.password : undefined;

  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new Error("用户名需要为 3–64 位字母、数字、点、下划线或短横线");
  }
  if (!displayName || displayName.length > 100) {
    throw new Error("姓名不能为空且不能超过 100 个字符");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("邮箱格式不正确");
  }
  if (role !== "admin" && role !== "operator") {
    throw new Error("角色必须是 admin 或 operator");
  }
  return { username, displayName, email, role, password } satisfies UserApiInput;
}

export function userApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("idx_app_users_username_lower")) return "用户名已存在";
  if (message.includes("idx_app_users_email_lower")) return "邮箱已被其他用户使用";
  return message;
}
