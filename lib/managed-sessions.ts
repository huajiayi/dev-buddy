import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ensureSchema, getPool } from "./db";
import type { AppUser, UserRole } from "./auth";
import { canAccessDatabase, canAccessServer } from "./authorization";
import type { ProjectApiKey } from "./server-management";
import { listManagedServers } from "./server-management";
import { listManagedDatabases } from "./database-management";

export type ManagedSessionStatus = "active" | "ending" | "completed" | "expired" | "revoked" | "failed";
export type ManagedResourceType = "server" | "database";

export type ManagedSessionResource = {
  type: ManagedResourceType;
  id: string;
  name: string;
  environment: string;
};

export type ManagedSession = {
  id: string;
  userId: string;
  userName: string;
  apiKeyName: string | null;
  objective: string;
  reason: string;
  plannedActions: string;
  status: ManagedSessionStatus;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedByName: string | null;
  endReason: string | null;
  summaryStatus: "pending" | "completed" | "failed";
  summary: string | null;
  summaryData: Record<string, unknown> | null;
  eventCount: number;
  resources: ManagedSessionResource[];
};

export type ManagedSessionEvent = {
  id: string;
  sessionId: string;
  sequence: number;
  eventType: string;
  resourceType: ManagedResourceType | null;
  resourceId: string | null;
  resourceName: string | null;
  action: string;
  status: string;
  executionId: string | null;
  requestPayload: Record<string, unknown>;
  resultMetadata: Record<string, unknown>;
  outputPreview: string | null;
  outputDigest: string | null;
  remoteAddress: string | null;
  previousHash: string | null;
  eventHash: string;
  createdAt: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  user_name: string;
  api_key_name: string | null;
  objective: string;
  reason: string;
  planned_actions: string;
  status: ManagedSessionStatus;
  started_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  ended_by_name: string | null;
  end_reason: string | null;
  summary_status: "pending" | "completed" | "failed";
  summary: string | null;
  summary_data: Record<string, unknown> | null;
  event_count: string;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeTokenEqual(stored: string, supplied: string) {
  const left = Buffer.from(stored, "hex");
  const right = Buffer.from(supplied, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

async function expireManagedSessions() {
  await ensureSchema();
  const expired = await getPool().query<{ id: string }>(
    `UPDATE ai_managed_sessions
     SET status='expired',ended_at=NOW(),end_reason='授权时间已到，系统自动结束'
     WHERE status='active' AND expires_at<=NOW()
     RETURNING id`,
  );
  for (const row of expired.rows) await generateManagedSessionSummary(row.id);
}

async function resourcesForSessions(ids: string[]) {
  if (!ids.length) return new Map<string, ManagedSessionResource[]>();
  const result = await getPool().query<{
    session_id: string;
    resource_type: ManagedResourceType;
    resource_id: string;
    resource_name: string;
    environment: string;
  }>(
    `SELECT * FROM ai_managed_session_resources
     WHERE session_id=ANY($1::uuid[])
     ORDER BY resource_type,resource_name`,
    [ids],
  );
  const map = new Map<string, ManagedSessionResource[]>();
  for (const row of result.rows) {
    const items = map.get(row.session_id) || [];
    items.push({ type: row.resource_type, id: row.resource_id, name: row.resource_name, environment: row.environment });
    map.set(row.session_id, items);
  }
  return map;
}

export async function listManagedSessions(user: Pick<AppUser, "id" | "role">, allUsers = false) {
  await expireManagedSessions();
  if (allUsers && user.role !== "admin") throw new Error("只有管理员可以查看全部托管记录");
  const result = await getPool().query<SessionRow>(
    `SELECT s.*,u.display_name AS user_name,k.name AS api_key_name,ender.display_name AS ended_by_name,
       (SELECT COUNT(*)::TEXT FROM ai_managed_session_events e WHERE e.session_id=s.id) AS event_count
     FROM ai_managed_sessions s
     JOIN app_users u ON u.id=s.user_id
     LEFT JOIN project_api_keys k ON k.id=s.api_key_id
     LEFT JOIN app_users ender ON ender.id=s.ended_by
     ${allUsers ? "" : "WHERE s.user_id=$1"}
     ORDER BY s.created_at DESC
     LIMIT 200`,
    allUsers ? [] : [user.id],
  );
  const resourceMap = await resourcesForSessions(result.rows.map((row) => row.id));
  return result.rows.map((row): ManagedSession => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    apiKeyName: row.api_key_name,
    objective: row.objective,
    reason: row.reason,
    plannedActions: row.planned_actions,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    endedByName: row.ended_by_name,
    endReason: row.end_reason,
    summaryStatus: row.summary_status,
    summary: row.summary,
    summaryData: row.summary_data,
    eventCount: Number(row.event_count),
    resources: resourceMap.get(row.id) || [],
  }));
}

export async function listManagedSessionEvents(
  sessionId: string,
  user: Pick<AppUser, "id" | "role">,
) {
  await expireManagedSessions();
  const session = await getPool().query<{ user_id: string }>(
    "SELECT user_id FROM ai_managed_sessions WHERE id=$1",
    [sessionId],
  );
  if (!session.rows[0] || (user.role !== "admin" && session.rows[0].user_id !== user.id)) {
    throw new Error("托管会话不存在或无权查看");
  }
  const result = await getPool().query<{
    id: string; session_id: string; sequence: number; event_type: string;
    resource_type: ManagedResourceType | null; resource_id: string | null; resource_name: string | null;
    action: string; status: string; execution_id: string | null;
    request_payload: Record<string, unknown>; result_metadata: Record<string, unknown>;
    output_preview: string | null; output_digest: string | null; remote_address: string | null;
    previous_hash: string | null; event_hash: string; created_at: Date;
  }>(
    "SELECT * FROM ai_managed_session_events WHERE session_id=$1 ORDER BY sequence",
    [sessionId],
  );
  return result.rows.map((row): ManagedSessionEvent => ({
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    eventType: row.event_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    action: row.action,
    status: row.status,
    executionId: row.execution_id,
    requestPayload: row.request_payload,
    resultMetadata: row.result_metadata,
    outputPreview: row.output_preview,
    outputDigest: row.output_digest,
    remoteAddress: row.remote_address,
    previousHash: row.previous_hash,
    eventHash: row.event_hash,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createManagedSession(input: {
  user: Pick<AppUser, "id" | "role">;
  apiKeyId?: string | null;
  objective: string;
  reason: string;
  plannedActions?: string;
  durationMinutes: number;
  serverIds: string[];
  databaseIds: string[];
}) {
  await expireManagedSessions();
  const principal = { userId: input.user.id, role: input.user.role };
  const objective = input.objective.trim().slice(0, 500);
  const reason = input.reason.trim().slice(0, 2000);
  const plannedActions = input.plannedActions?.trim().slice(0, 2000) || "";
  if (!objective) throw new Error("请填写托管目标");
  if (!reason) throw new Error("请说明为什么需要开启全托管");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 120) {
    throw new Error("托管时长必须在 15 到 120 分钟之间");
  }

  const serverIds = [...new Set(input.serverIds)];
  const databaseIds = [...new Set(input.databaseIds)];
  if (!serverIds.length && !databaseIds.length) throw new Error("请至少选择一个服务器或数据库");
  const [servers, databases] = await Promise.all([listManagedServers(), listManagedDatabases()]);
  const selectedServers: ManagedSessionResource[] = [];
  const selectedDatabases: ManagedSessionResource[] = [];
  for (const id of serverIds) {
    const server = servers.find((item) => item.id === id);
    if (!server || !server.enabled || !await canAccessServer(principal, id)) {
      throw new Error("服务器不存在、已禁用或未授权");
    }
    selectedServers.push({ type: "server", id, name: server.name, environment: server.environment });
  }
  for (const id of databaseIds) {
    const database = databases.find((item) => item.id === id);
    if (!database || !database.enabled || !await canAccessDatabase(principal, id, "executeSql")) {
      throw new Error("数据库不存在、已禁用或未授权");
    }
    selectedDatabases.push({ type: "database", id, name: database.name, environment: database.environment });
  }

  const id = randomUUID();
  const token = `dbm_${randomBytes(32).toString("base64url")}`;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ai_managed_sessions
       (id,user_id,api_key_id,token_hash,objective,reason,planned_actions,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()+($8::TEXT||' minutes')::INTERVAL)`,
      [id, input.user.id, input.apiKeyId || null, hash(token), objective, reason, plannedActions, input.durationMinutes],
    );
    for (const resource of [...selectedServers, ...selectedDatabases]) {
      await client.query(
        `INSERT INTO ai_managed_session_resources
         (session_id,resource_type,resource_id,resource_name,environment)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, resource.type, resource.id, resource.name, resource.environment],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new Error("当前用户已经有一个进行中的托管会话");
    }
    throw error;
  } finally {
    client.release();
  }
  return { id, token };
}

export async function authorizeManagedSession(input: {
  token: string;
  apiKey: ProjectApiKey;
  resourceType: ManagedResourceType;
  resourceId: string;
}) {
  await expireManagedSessions();
  const tokenHash = hash(input.token);
  const result = await getPool().query<{
    id: string; user_id: string; api_key_id: string | null; token_hash: string;
    status: ManagedSessionStatus; expires_at: Date; resource_name: string;
  }>(
    `SELECT s.*,r.resource_name FROM ai_managed_sessions s
     JOIN ai_managed_session_resources r ON r.session_id=s.id
     WHERE s.token_hash=$1 AND r.resource_type=$2 AND r.resource_id=$3`,
    [tokenHash, input.resourceType, input.resourceId],
  );
  const session = result.rows[0];
  if (!session || !safeTokenEqual(session.token_hash, tokenHash)) throw new Error("托管令牌无效或资源不在授权范围内");
  if (session.user_id !== input.apiKey.ownerUserId) throw new Error("托管令牌与 API Key 用户不匹配");
  if (session.api_key_id && session.api_key_id !== input.apiKey.id) throw new Error("托管令牌已绑定其他 API Key");
  if (session.status !== "active" || session.expires_at.getTime() <= Date.now()) throw new Error("托管会话已结束或过期");
  const principal = { userId: input.apiKey.ownerUserId, role: input.apiKey.ownerRole as UserRole };
  const stillAllowed = input.resourceType === "server"
    ? await canAccessServer(principal, input.resourceId)
    : await canAccessDatabase(principal, input.resourceId, "executeSql");
  if (!stillAllowed) throw new Error("用户已失去该资源权限");
  if (!session.api_key_id) {
    const bound = await getPool().query<{ api_key_id: string }>(
      `UPDATE ai_managed_sessions SET api_key_id=$2
       WHERE id=$1 AND api_key_id IS NULL
       RETURNING api_key_id`,
      [session.id, input.apiKey.id],
    );
    if (!bound.rows[0]) {
      const current = await getPool().query<{ api_key_id: string | null }>(
        "SELECT api_key_id FROM ai_managed_sessions WHERE id=$1",
        [session.id],
      );
      if (current.rows[0]?.api_key_id !== input.apiKey.id) {
        throw new Error("托管令牌已绑定其他 API Key");
      }
    }
  }
  return { id: session.id, resourceName: session.resource_name };
}

export async function recordManagedSessionEvent(input: {
  sessionId: string;
  eventType: string;
  resourceType?: ManagedResourceType;
  resourceId?: string;
  resourceName?: string;
  action: string;
  status: string;
  executionId?: string;
  requestPayload?: Record<string, unknown>;
  resultMetadata?: Record<string, unknown>;
  output?: string;
  remoteAddress?: string;
}) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM ai_managed_sessions WHERE id=$1 FOR UPDATE", [input.sessionId]);
    const previous = await client.query<{ sequence: number; event_hash: string }>(
      `SELECT sequence,event_hash FROM ai_managed_session_events
       WHERE session_id=$1 ORDER BY sequence DESC LIMIT 1`,
      [input.sessionId],
    );
    const sequence = (previous.rows[0]?.sequence || 0) + 1;
    const previousHash = previous.rows[0]?.event_hash || null;
    const output = input.output?.slice(0, 8192) || "";
    const payload = {
      sessionId: input.sessionId,
      sequence,
      eventType: input.eventType,
      resourceType: input.resourceType || null,
      resourceId: input.resourceId || null,
      action: input.action,
      status: input.status,
      executionId: input.executionId || null,
      requestPayload: input.requestPayload || {},
      resultMetadata: input.resultMetadata || {},
      outputDigest: output ? hash(output) : null,
      previousHash,
    };
    const eventHash = hash(JSON.stringify(payload));
    await client.query(
      `INSERT INTO ai_managed_session_events
       (id,session_id,sequence,event_type,resource_type,resource_id,resource_name,action,status,
        execution_id,request_payload,result_metadata,output_preview,output_digest,remote_address,
        previous_hash,event_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        randomUUID(), input.sessionId, sequence, input.eventType, input.resourceType || null,
        input.resourceId || null, input.resourceName || null, input.action.slice(0, 20 * 1024),
        input.status, input.executionId || null, JSON.stringify(input.requestPayload || {}),
        JSON.stringify(input.resultMetadata || {}), output || null, output ? hash(output) : null,
        input.remoteAddress?.slice(0, 128) || null, previousHash, eventHash,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function generateManagedSessionSummary(sessionId: string) {
  await ensureSchema();
  try {
    const [sessionResult, eventResult, resourceResult] = await Promise.all([
      getPool().query<{ objective: string; started_at: Date; ended_at: Date | null }>(
        "SELECT objective,started_at,ended_at FROM ai_managed_sessions WHERE id=$1",
        [sessionId],
      ),
      getPool().query<{ event_type: string; status: string; action: string; resource_name: string | null }>(
        "SELECT event_type,status,action,resource_name FROM ai_managed_session_events WHERE session_id=$1 ORDER BY sequence",
        [sessionId],
      ),
      getPool().query<{ resource_type: ManagedResourceType; resource_name: string }>(
        "SELECT resource_type,resource_name FROM ai_managed_session_resources WHERE session_id=$1 ORDER BY resource_type,resource_name",
        [sessionId],
      ),
    ]);
    const session = sessionResult.rows[0];
    if (!session) return;
    const events = eventResult.rows;
    const success = events.filter((item) => item.status === "success").length;
    const failed = events.filter((item) => item.status === "failed").length;
    const rejected = events.filter((item) => item.status === "rejected").length;
    const risky = events.filter((item) =>
      /\b(?:rm|kill|reboot|shutdown|systemctl\s+(?:restart|stop)|docker\s+(?:rm|restart|compose\s+(?:down|up))|drop|delete|truncate|alter|update|insert)\b/i.test(item.action),
    );
    const resourceNames = resourceResult.rows.map((item) => `${item.resource_type === "server" ? "服务器" : "数据库"} ${item.resource_name}`);
    const durationMinutes = Math.max(0, Math.round(((session.ended_at?.getTime() || Date.now()) - session.started_at.getTime()) / 60000));
    const summaryData = {
      durationMinutes,
      resources: resourceNames,
      eventCount: events.length,
      successCount: success,
      failedCount: failed,
      rejectedCount: rejected,
      highRiskActions: risky.map((item) => ({ resource: item.resource_name, action: item.action.slice(0, 500), status: item.status })),
    };
    const summary = [
      `托管目标：${session.objective}`,
      `持续时间：约 ${durationMinutes} 分钟，涉及 ${resourceNames.length} 个资源。`,
      `共记录 ${events.length} 个动作，其中成功 ${success} 个、失败 ${failed} 个、拒绝 ${rejected} 个。`,
      risky.length ? `检测到 ${risky.length} 个修改、删除、重启或写入类高风险动作，请结合操作时间线复核。` : "未检测到明显的修改、删除、重启或写入类高风险动作。",
      failed || rejected ? "会话存在失败或拒绝动作，建议查看时间线确认是否仍有未完成事项。" : "所有已记录动作均已完成，建议按托管目标进行最终业务验证。",
    ].join("\n");
    await getPool().query(
      `UPDATE ai_managed_sessions
       SET summary_status='completed',summary=$2,summary_data=$3
       WHERE id=$1`,
      [sessionId, summary, JSON.stringify(summaryData)],
    );
  } catch (error) {
    await getPool().query(
      "UPDATE ai_managed_sessions SET summary_status='failed',summary=$2 WHERE id=$1",
      [sessionId, error instanceof Error ? error.message.slice(0, 1000) : "总结生成失败"],
    );
  }
}

export async function endManagedSession(input: {
  sessionId: string;
  actor: Pick<AppUser, "id" | "role">;
  reason?: string;
}) {
  await expireManagedSessions();
  const current = await getPool().query<{ user_id: string; status: ManagedSessionStatus }>(
    "SELECT user_id,status FROM ai_managed_sessions WHERE id=$1",
    [input.sessionId],
  );
  const session = current.rows[0];
  if (!session || (input.actor.role !== "admin" && session.user_id !== input.actor.id)) {
    throw new Error("托管会话不存在或无权结束");
  }
  if (session.status !== "active") return;
  const status: ManagedSessionStatus = input.actor.role === "admin" && session.user_id !== input.actor.id
    ? "revoked"
    : "completed";
  await getPool().query(
    `UPDATE ai_managed_sessions
     SET status=$2,ended_at=NOW(),ended_by=$3,end_reason=$4
     WHERE id=$1 AND status='active'`,
    [input.sessionId, status, input.actor.id, input.reason?.trim().slice(0, 1000) || (status === "revoked" ? "管理员强制结束" : "用户主动结束")],
  );
  await generateManagedSessionSummary(input.sessionId);
}
