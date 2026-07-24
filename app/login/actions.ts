"use server";

import { redirect } from "next/navigation";
import { authenticateLocalUser, createSession, destroySession, initializeAdmin, safeReturnPath } from "@/lib/auth";

function normalizeAccount(value: string) {
  const account = value.trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(account)) throw new Error("用户名需要为 3–64 位字母、数字、点、下划线或短横线");
  return account;
}

export async function loginAction(input: { account: string; password: string; returnTo?: string }) {
  try {
    const account = input.account.trim();
    if (!account || !input.password) return { ok: false, error: "请输入用户名和密码" } as const;
    const user = await authenticateLocalUser(account, input.password);
    if (!user) return { ok: false, error: "用户名或密码错误" } as const;
    await createSession(user.id);
    return { ok: true, returnTo: safeReturnPath(input.returnTo) } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "登录失败" } as const;
  }
}

export async function initializeAction(input: { username: string; displayName: string; email?: string; password: string }) {
  try {
    const username = normalizeAccount(input.username);
    const displayName = input.displayName.trim();
    const email = input.email?.trim();
    if (!displayName) return { ok: false, error: "请输入管理员姓名" } as const;
    const userId = await initializeAdmin({ username, displayName, email, password: input.password });
    await createSession(userId);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "系统初始化失败" } as const;
  }
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
