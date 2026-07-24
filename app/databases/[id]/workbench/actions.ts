"use server";

import {
  executeDatabaseQuery,
  listDatabaseColumns,
  listDatabaseTables,
  listManagedDatabases,
} from "@/lib/database-management";
import { requireUser } from "@/lib/auth";
import { requireDatabaseAccess } from "@/lib/authorization";

function validId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function validObjectName(value: string) {
  return Boolean(value.trim()) && value.length <= 256;
}

export async function loadSchemaTables(databaseId: string, schema: string) {
  if (!validId(databaseId) || !validObjectName(schema)) {
    return { ok: false as const, error: "数据库或 Schema 参数无效" };
  }
  try {
    const user = await requireUser();
    await requireDatabaseAccess(user, databaseId, "executeSql");
    return { ok: true as const, data: await listDatabaseTables(databaseId, schema) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "表结构读取失败" };
  }
}

export async function loadTableColumns(databaseId: string, schema: string, table: string) {
  if (!validId(databaseId) || !validObjectName(schema) || !validObjectName(table)) {
    return { ok: false as const, error: "数据库、Schema 或表参数无效" };
  }
  try {
    const user = await requireUser();
    await requireDatabaseAccess(user, databaseId, "executeSql");
    return { ok: true as const, data: await listDatabaseColumns(databaseId, schema, table) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "字段结构读取失败" };
  }
}

export async function executeWorkbenchSql(
  databaseIdValue: string,
  sqlValue: string,
  timeoutSecondsValue: number,
) {
  const databaseId = databaseIdValue.trim();
  const sql = sqlValue.trim();
  if (!validId(databaseId)) {
    return { ok: false as const, error: "数据库 ID 格式错误" };
  }
  if (!sql) return { ok: false as const, error: "SQL 不能为空" };
  try {
    const user = await requireUser();
    await requireDatabaseAccess(user, databaseId, "executeSql");
    const database = (await listManagedDatabases()).find((item) => item.id === databaseId);
    if (!database) return { ok: false as const, error: "数据库不存在" };
    const result = await executeDatabaseQuery({
      databaseId,
      sql,
      reason: "数据库工作台手动执行",
      timeoutSeconds: Math.max(1, Math.min(Number(timeoutSecondsValue) || 15, 30)),
      source: "admin-workbench",
      actorUserId: user.id,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "SQL 执行失败",
    };
  }
}
