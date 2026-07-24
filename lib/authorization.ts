import "server-only";

import { ensureSchema, getPool } from "./db";
import type { AppUser, UserRole } from "./auth";

export type ServerGrant = {
  userId: string;
  serverId: string;
  canExecuteCommand: boolean;
  canOpenSsh: boolean;
};

export type DatabaseGrant = {
  userId: string;
  databaseId: string;
  canExecuteSql: boolean;
};

export type AuthorizationPrincipal = {
  userId: string;
  role: UserRole;
};

type ServerCapability = "read" | "executeCommand" | "openSsh";
type DatabaseCapability = "read" | "executeSql";

function principalOf(user: AppUser | AuthorizationPrincipal): AuthorizationPrincipal {
  return "userId" in user ? user : { userId: user.id, role: user.role };
}

export async function canAccessServer(
  user: AppUser | AuthorizationPrincipal,
  serverId: string,
  capability: ServerCapability,
) {
  const principal = principalOf(user);
  if (principal.role === "admin") return true;
  await ensureSchema();
  const result = await getPool().query<{
    can_execute_command: boolean;
    can_open_ssh: boolean;
  }>(
    `SELECT can_execute_command,can_open_ssh
     FROM user_server_grants WHERE user_id=$1 AND server_id=$2`,
    [principal.userId, serverId],
  );
  const grant = result.rows[0];
  if (!grant) return false;
  if (capability === "executeCommand") return grant.can_execute_command;
  if (capability === "openSsh") return grant.can_open_ssh;
  return grant.can_execute_command || grant.can_open_ssh;
}

export async function canAccessDatabase(
  user: AppUser | AuthorizationPrincipal,
  databaseId: string,
  capability: DatabaseCapability,
) {
  const principal = principalOf(user);
  if (principal.role === "admin") return true;
  await ensureSchema();
  const result = await getPool().query<{ can_execute_sql: boolean }>(
    `SELECT can_execute_sql
     FROM user_database_grants WHERE user_id=$1 AND database_id=$2`,
    [principal.userId, databaseId],
  );
  const grant = result.rows[0];
  if (!grant) return false;
  return capability === "read" || grant.can_execute_sql;
}

export async function requireServerAccess(
  user: AppUser | AuthorizationPrincipal,
  serverId: string,
  capability: ServerCapability,
) {
  if (!await canAccessServer(user, serverId, capability)) {
    throw new Error("没有这台服务器的操作权限");
  }
}

export async function requireDatabaseAccess(
  user: AppUser | AuthorizationPrincipal,
  databaseId: string,
  capability: DatabaseCapability,
) {
  if (!await canAccessDatabase(user, databaseId, capability)) {
    throw new Error("没有这个数据库的操作权限");
  }
}

export async function accessibleServerIds(user: AppUser | AuthorizationPrincipal) {
  const principal = principalOf(user);
  if (principal.role === "admin") return null;
  await ensureSchema();
  const result = await getPool().query<{ server_id: string }>(
    "SELECT server_id FROM user_server_grants WHERE user_id=$1",
    [principal.userId],
  );
  return new Set(result.rows.map((row) => row.server_id));
}

export async function accessibleDatabaseIds(user: AppUser | AuthorizationPrincipal) {
  const principal = principalOf(user);
  if (principal.role === "admin") return null;
  await ensureSchema();
  const result = await getPool().query<{ database_id: string }>(
    "SELECT database_id FROM user_database_grants WHERE user_id=$1 AND can_execute_sql=TRUE",
    [principal.userId],
  );
  return new Set(result.rows.map((row) => row.database_id));
}

export async function listResourceGrants() {
  await ensureSchema();
  const [serverResult, databaseResult] = await Promise.all([
    getPool().query<{
      user_id: string; server_id: string; can_execute_command: boolean; can_open_ssh: boolean;
    }>("SELECT user_id,server_id,can_execute_command,can_open_ssh FROM user_server_grants"),
    getPool().query<{
      user_id: string; database_id: string; can_execute_sql: boolean;
    }>("SELECT user_id,database_id,can_execute_sql FROM user_database_grants"),
  ]);
  return {
    serverGrants: serverResult.rows.map((row): ServerGrant => ({
      userId: row.user_id,
      serverId: row.server_id,
      canExecuteCommand: row.can_execute_command,
      canOpenSsh: row.can_open_ssh,
    })),
    databaseGrants: databaseResult.rows.map((row): DatabaseGrant => ({
      userId: row.user_id,
      databaseId: row.database_id,
      canExecuteSql: row.can_execute_sql,
    })),
  };
}

export async function listUserResourceGrants(userId: string) {
  const grants = await listResourceGrants();
  return {
    serverGrants: grants.serverGrants.filter((item) => item.userId === userId),
    databaseGrants: grants.databaseGrants.filter((item) => item.userId === userId),
  };
}

export async function replaceUserResourceGrants(input: {
  userId: string;
  grantedBy: string;
  serverGrants: Array<{ serverId: string; canExecuteCommand: boolean; canOpenSsh: boolean }>;
  databaseIds: string[];
}) {
  await ensureSchema();
  const target = await getPool().query<{ role: UserRole }>(
    "SELECT role FROM app_users WHERE id=$1",
    [input.userId],
  );
  if (!target.rows[0]) throw new Error("用户不存在");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_server_grants WHERE user_id=$1", [input.userId]);
    await client.query("DELETE FROM user_database_grants WHERE user_id=$1", [input.userId]);
    if (target.rows[0].role === "operator") {
      for (const grant of input.serverGrants) {
        if (!grant.canExecuteCommand && !grant.canOpenSsh) continue;
        await client.query(
          `INSERT INTO user_server_grants
           (user_id,server_id,can_execute_command,can_open_ssh,granted_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [input.userId, grant.serverId, grant.canExecuteCommand, grant.canOpenSsh, input.grantedBy],
        );
      }
      for (const databaseId of new Set(input.databaseIds)) {
        await client.query(
          `INSERT INTO user_database_grants
           (user_id,database_id,can_execute_sql,granted_by)
           VALUES ($1,$2,TRUE,$3)`,
          [input.userId, databaseId, input.grantedBy],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
