"use server";

import { revalidatePath } from "next/cache";
import { insertAliyunAccount, removeAliyunAccount, setAliyunAccountSite, updateAliyunAccount } from "@/lib/aliyun-accounts";
import { requireAdmin } from "@/lib/auth";

type AccountInput = { name: string; accessKeyId: string; accessKeySecret: string; site: "china" | "international" };

export async function createAliyunAccount(input: AccountInput) {
  try {
    await requireAdmin();
    const name = input.name.trim();
    const accessKeyId = input.accessKeyId.trim();
    const accessKeySecret = input.accessKeySecret.trim();
    if (!name || !accessKeyId || !accessKeySecret || !["china", "international"].includes(input.site)) return { ok: false, error: "请填写完整的账号信息" };
    const id = await insertAliyunAccount({ name, accessKeyId, accessKeySecret, site: input.site });
    revalidatePath("/aliyun");
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "账号保存失败" };
  }
}

export async function updateAliyunAccountSite(id: string, site: "china" | "international") {
  try {
    await requireAdmin();
    if (!["china", "international"].includes(site)) return { ok: false, error: "无效的阿里云站点" };
    await setAliyunAccountSite(id, site);
    revalidatePath("/aliyun");
    revalidatePath("/aliyun-account");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "站点更新失败" };
  }
}

export async function editAliyunAccount(id: string, input: AccountInput) {
  try {
    await requireAdmin();
    const name = input.name.trim();
    const accessKeyId = input.accessKeyId.trim();
    const accessKeySecret = input.accessKeySecret.trim();
    if (!id || !name || !accessKeyId || !["china", "international"].includes(input.site)) {
      return { ok: false, error: "请填写完整的账号信息" };
    }
    await updateAliyunAccount({
      id,
      name,
      accessKeyId,
      accessKeySecret: accessKeySecret || undefined,
      site: input.site,
    });
    revalidatePath("/aliyun");
    revalidatePath("/aliyun-account");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "账号更新失败" };
  }
}

export async function deleteAliyunAccount(id: string) {
  try {
    await requireAdmin();
    await removeAliyunAccount(id);
    revalidatePath("/aliyun");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "账号删除失败" };
  }
}
