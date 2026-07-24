"use server";

import { executeManagedCommand } from "@/lib/server-management";
import { requireUser } from "@/lib/auth";

export async function executeTerminalCommand(serverIdValue: string, commandValue: string) {
  const serverId = serverIdValue.trim();
  const command = commandValue.trim();
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) return { ok: false as const, error: "服务器 ID 格式错误" };
  if (!command) return { ok: false as const, error: "命令不能为空" };
  if (command.length > 2000) return { ok: false as const, error: "命令不能超过 2000 个字符" };

  try {
    await requireUser();
    const result = await executeManagedCommand({
      serverId,
      command,
      reason: "后台 Web 终端手动执行",
      timeoutSeconds: 30,
      source: "admin-terminal",
    });
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "命令执行失败" };
  }
}
