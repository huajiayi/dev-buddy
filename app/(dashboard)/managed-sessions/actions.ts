"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createManagedSession, endManagedSession } from "@/lib/managed-sessions";

export type ManagedSessionInput = {
  objective: string;
  reason: string;
  plannedActions?: string;
  durationMinutes: number;
  serverIds: string[];
  databaseIds: string[];
};

export async function createManagedSessionAction(input: ManagedSessionInput) {
  try {
    const user = await requireUser();
    const created = await createManagedSession({
      user,
      objective: input.objective,
      reason: input.reason,
      plannedActions: input.plannedActions,
      durationMinutes: Number(input.durationMinutes),
      serverIds: input.serverIds || [],
      databaseIds: input.databaseIds || [],
    });
    revalidatePath("/managed-sessions");
    revalidatePath("/managed-session-audit");
    return { ok: true as const, sessionId: created.id, token: created.token };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "托管会话创建失败",
    };
  }
}

export async function endManagedSessionAction(sessionId: string, reason?: string) {
  try {
    const user = await requireUser();
    await endManagedSession({ sessionId, actor: user, reason });
    revalidatePath("/managed-sessions");
    revalidatePath("/managed-session-audit");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "托管会话结束失败",
    };
  }
}
