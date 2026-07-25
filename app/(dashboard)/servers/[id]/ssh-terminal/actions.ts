"use server";

import { listManagedServers } from "@/lib/server-management";
import { createSshTerminalTicket } from "@/lib/terminal-ticket";
import { requireUser } from "@/lib/auth";
import { requireServerAccess } from "@/lib/authorization";

export async function issueSshTerminalTicket(serverIdValue: string) {
  const serverId = serverIdValue.trim();
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) {
    return { ok: false as const, error: "服务器 ID 格式错误" };
  }
  try {
    const user = await requireUser();
    await requireServerAccess(user, serverId);
    const server = (await listManagedServers()).find((item) => item.id === serverId);
    if (!server) return { ok: false as const, error: "服务器不存在" };
    if (!server.enabled) return { ok: false as const, error: "服务器已禁用" };
    return { ok: true as const, ticket: createSshTerminalTicket(serverId, user.id) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "创建 SSH 终端连接失败",
    };
  }
}
