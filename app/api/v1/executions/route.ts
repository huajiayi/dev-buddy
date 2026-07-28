import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { isHighRiskCommand } from "@/lib/command-risk";
import { authenticateProjectApiKey, checkApiKeyRateLimit, executeManagedCommand } from "@/lib/server-management";
import { requireServerAccess } from "@/lib/authorization";
import { authorizeManagedSession, recordManagedSessionEvent } from "@/lib/managed-sessions";

export const runtime = "nodejs";
export const maxDuration = 65;

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type", message: "Content-Type 必须是 application/json" }, { status: 415 });
  }
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  if (!await checkApiKeyRateLimit(apiKey.id)) return NextResponse.json({ error: "rate_limited", message: "每个 API Key 每分钟最多执行 30 个任务" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "请求体不是有效 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_request", message: "请求体格式错误" }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.serverId !== "string" || typeof input.command !== "string") {
    return NextResponse.json({ error: "invalid_request", message: "serverId 和 command 为必填字符串" }, { status: 400 });
  }
  const timeoutSeconds = typeof input.timeoutSeconds === "number" ? input.timeoutSeconds : 30;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 60) {
    return NextResponse.json({ error: "invalid_timeout", message: "timeoutSeconds 必须在 1 到 60 之间" }, { status: 400 });
  }

  try {
    const managedToken = request.headers.get("x-managed-session")?.trim();
    const managedSession = managedToken
      ? await authorizeManagedSession({
        token: managedToken,
        apiKey,
        resourceType: "server",
        resourceId: input.serverId,
      })
      : null;
    if (managedSession) {
      const confirmation = confirmationRequired(request, "execute-managed-command");
      if (confirmation) return confirmation;
    } else if (isHighRiskCommand(input.command)) {
      const confirmation = confirmationRequired(request, "execute-risky-command");
      if (confirmation) return confirmation;
    }
    if (!managedSession) {
      await requireServerAccess({ userId: apiKey.ownerUserId, role: apiKey.ownerRole }, input.serverId);
    }
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const remoteAddress = forwarded || request.headers.get("x-real-ip") || undefined;
    const result = await executeManagedCommand({
      serverId: input.serverId,
      apiKeyId: apiKey.id,
      actorUserId: apiKey.ownerUserId,
      managedSessionId: managedSession?.id,
      bypassPolicy: Boolean(managedSession),
      command: input.command,
      reason: typeof input.reason === "string" ? input.reason : "",
      timeoutSeconds,
      remoteAddress,
      source: managedSession ? "ai-managed" : "api",
    });
    if (managedSession) {
      await recordManagedSessionEvent({
        sessionId: managedSession.id,
        eventType: "server-command",
        resourceType: "server",
        resourceId: input.serverId,
        resourceName: managedSession.resourceName,
        action: input.command,
        status: result.status,
        executionId: result.executionId,
        requestPayload: {
          reason: typeof input.reason === "string" ? input.reason : "",
          timeoutSeconds,
        },
        resultMetadata: {
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          policyDecision: result.policyDecision,
          policyReason: result.policyReason,
        },
        output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
        remoteAddress,
      });
    }
    const status = result.status === "rejected" ? 403 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "命令执行失败";
    const denied = message.includes("操作权限");
    return NextResponse.json({ error: denied ? "resource_not_found" : "execution_failed", message: denied ? "服务器不存在或未授权" : message }, { status: denied || message === "服务器不存在" ? 404 : 500 });
  }
}
