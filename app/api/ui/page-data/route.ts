import { NextRequest, NextResponse } from "next/server";
import { fetchAliyunOverview } from "@/lib/aliyun";
import { getAliyunAccount, listAliyunAccounts, listAliyunCredentials } from "@/lib/aliyun-accounts";
import { fetchAccountCosts, fetchAccountResources, fetchAccountRisks } from "@/lib/aliyun-insights";
import {
  accessibleDatabaseIds,
  accessibleServerIds,
  canAccessDatabase,
  canAccessServer,
  listResourceGrants,
  listUserResourceGrants,
} from "@/lib/authorization";
import { getCurrentUser, listUsers, type AppUser } from "@/lib/auth";
import {
  listDatabaseQueryExecutions,
  listDatabaseQueryPolicies,
  listDatabaseSchemas,
  listManagedDatabases,
} from "@/lib/database-management";
import {
  listCommandExecutions,
  listCommandPolicies,
  listManagedServers,
  listProjectApiKeys,
  listSshTerminalSessions,
} from "@/lib/server-management";
import { hasDefaultUserPassword } from "@/lib/system-settings";
import { listManagedSessionEvents, listManagedSessions } from "@/lib/managed-sessions";
import { getDevBuddyVersionInfo } from "@/lib/dev-buddy-version";

export const runtime = "nodejs";
export const maxDuration = 65;

class UiDataError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function requireAdmin(user: AppUser) {
  if (user.role !== "admin") throw new UiDataError("只有管理员可以访问此页面", 403);
}

function requireId(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UiDataError("资源 ID 格式错误", 400);
  return id;
}

async function loadPageData(view: string, request: NextRequest, user: AppUser) {
  if (view === "users") {
    requireAdmin(user);
    const [users, servers, databases, grants, defaultPasswordConfigured] = await Promise.all([
      listUsers(),
      listManagedServers(),
      listManagedDatabases(),
      listResourceGrants(),
      hasDefaultUserPassword(),
    ]);
    return { users, currentUserId: user.id, servers, databases, ...grants, defaultPasswordConfigured };
  }
  if (view === "servers") {
    const [servers, ids, grants] = await Promise.all([
      listManagedServers(),
      accessibleServerIds(user),
      listUserResourceGrants(user.id),
    ]);
    return {
      servers: ids ? servers.filter((item) => ids.has(item.id)) : servers,
      isAdmin: user.role === "admin",
      grants: grants.serverGrants,
    };
  }
  if (view === "server") {
    const id = requireId(request);
    if (!await canAccessServer(user, id)) throw new UiDataError("服务器不存在或未授权", 404);
    const server = (await listManagedServers()).find((item) => item.id === id);
    if (!server) throw new UiDataError("服务器不存在", 404);
    return { server };
  }
  if (view === "databases") {
    const [databases, servers, ids, grants] = await Promise.all([
      listManagedDatabases(),
      user.role === "admin" ? listManagedServers() : Promise.resolve([]),
      accessibleDatabaseIds(user),
      listUserResourceGrants(user.id),
    ]);
    return {
      databases: ids ? databases.filter((item) => ids.has(item.id)) : databases,
      servers,
      isAdmin: user.role === "admin",
      grants: grants.databaseGrants,
    };
  }
  if (view === "database-workbench") {
    const id = requireId(request);
    if (!await canAccessDatabase(user, id, "executeSql")) {
      throw new UiDataError("数据库不存在或未授权", 404);
    }
    const database = (await listManagedDatabases()).find((item) => item.id === id);
    if (!database) throw new UiDataError("数据库不存在", 404);
    let schemas: string[] = [];
    let structureError: string | undefined;
    try {
      schemas = await listDatabaseSchemas(id);
    } catch (error) {
      structureError = error instanceof Error ? error.message : "数据库结构读取失败";
    }
    return { database, schemas, structureError };
  }
  if (view === "api-keys") {
    return { apiKeys: await listProjectApiKeys(user.id) };
  }
  if (view === "command-policies") {
    requireAdmin(user);
    return { policies: await listCommandPolicies() };
  }
  if (view === "executions") {
    requireAdmin(user);
    return { executions: await listCommandExecutions() };
  }
  if (view === "terminal-sessions") {
    requireAdmin(user);
    return { sessions: await listSshTerminalSessions() };
  }
  if (view === "database-policies") {
    requireAdmin(user);
    return { policies: await listDatabaseQueryPolicies() };
  }
  if (view === "database-executions") {
    requireAdmin(user);
    return { executions: await listDatabaseQueryExecutions() };
  }
  if (view === "system-settings") {
    requireAdmin(user);
    return {
      hasDefaultPassword: await hasDefaultUserPassword(),
      versionInfo: getDevBuddyVersionInfo(),
    };
  }
  if (view === "managed-sessions") {
    const [sessions, servers, databases, serverIds, databaseIds] = await Promise.all([
      listManagedSessions(user),
      listManagedServers(),
      listManagedDatabases(),
      accessibleServerIds(user),
      accessibleDatabaseIds(user),
    ]);
    return {
      sessions,
      servers: servers.filter((item) => item.enabled && (!serverIds || serverIds.has(item.id))),
      databases: databases.filter((item) => item.enabled && (!databaseIds || databaseIds.has(item.id))),
    };
  }
  if (view === "managed-session-audit") {
    requireAdmin(user);
    return { sessions: await listManagedSessions(user, true) };
  }
  if (view === "managed-session-detail") {
    const id = requireId(request);
    return { events: await listManagedSessionEvents(id, user) };
  }
  if (view === "aliyun-accounts") {
    requireAdmin(user);
    return { accounts: await listAliyunAccounts() };
  }
  if (view === "aliyun-account") {
    requireAdmin(user);
    const id = requireId(request);
    const credential = await getAliyunAccount(id);
    if (!credential) throw new UiDataError("阿里云账号不存在", 404);
    const { accessKeySecret, ...account } = credential;
    try {
      const overview = await fetchAliyunOverview({
        accessKeyId: account.accessKeyId,
        accessKeySecret,
        site: account.site,
      });
      return { account, overview };
    } catch (error) {
      return {
        account,
        error: error instanceof Error ? error.message : "阿里云接口调用失败",
      };
    }
  }
  if (view === "aliyun-resources" || view === "aliyun-costs" || view === "aliyun-risks") {
    requireAdmin(user);
    const accounts = await listAliyunCredentials();
    if (view === "aliyun-resources") {
      return { data: await Promise.all(accounts.map(fetchAccountResources)) };
    }
    if (view === "aliyun-costs") {
      return { data: await Promise.all(accounts.map(fetchAccountCosts)) };
    }
    return { data: await Promise.all(accounts.map(fetchAccountRisks)) };
  }
  throw new UiDataError("未知页面数据类型", 404);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UiDataError("登录状态已失效，请重新登录", 401);
    const view = request.nextUrl.searchParams.get("view") || "";
    const data = await loadPageData(view, request, user);
    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof UiDataError ? error.status : 500;
    return NextResponse.json({
      error: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "page_data_failed",
      message: error instanceof Error ? error.message : "页面数据加载失败",
    }, { status });
  }
}
