"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { clearDefaultUserPassword, setDefaultUserPassword } from "@/lib/system-settings";

export async function saveDefaultUserPasswordAction(password: string) {
  try {
    const currentUser = await requireAdmin();
    await setDefaultUserPassword(password, currentUser.id);
    revalidatePath("/system-settings");
    revalidatePath("/");
    return { ok: true } as const;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "默认密码保存失败",
    } as const;
  }
}

export async function clearDefaultUserPasswordAction() {
  try {
    await requireAdmin();
    await clearDefaultUserPassword();
    revalidatePath("/system-settings");
    revalidatePath("/");
    return { ok: true } as const;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "默认密码清除失败",
    } as const;
  }
}
