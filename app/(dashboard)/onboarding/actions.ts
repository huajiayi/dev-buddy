"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { requireServerAccess } from "@/lib/authorization";
import { executeManagedCommand } from "@/lib/server-management";

export async function runFirstHealthCheck(serverIdValue: string) {
  const serverId = serverIdValue.trim();
  if (!/^[0-9a-f-]{36}$/i.test(serverId)) {
    return { ok: false as const, error: "服务器 ID 格式错误" };
  }

  try {
    const user = await requireUser();
    await requireServerAccess(user, serverId);
    const result = await executeManagedCommand({
      serverId,
      command: "uptime",
      reason: "新手引导首次只读健康检查",
      timeoutSeconds: 15,
      source: "onboarding",
      actorUserId: user.id,
    });
    revalidatePath("/");
    return {
      ok: result.status === "success",
      result: {
        executionId: result.executionId,
        status: result.status,
        policyDecision: result.policyDecision,
        policyReason: result.policyReason,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      },
      error: result.status === "success"
        ? undefined
        : result.status === "rejected"
          ? `命令策略拒绝：${result.policyReason}`
          : result.stderr || "健康检查失败",
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "健康检查失败",
    };
  }
}
