import "server-only";

import { randomUUID } from "node:crypto";
import { ensureSchema, getPool } from "./db";
import { hashPassword, type UserRole } from "./auth";

export type UserInput = {
  username: string;
  displayName: string;
  email?: string;
  role: UserRole;
  password?: string;
};

async function protectLastAdmin(userId: string, nextRole?: UserRole, nextEnabled?: boolean) {
  const target = await getPool().query<{ role: UserRole; enabled: boolean }>("SELECT role,enabled FROM app_users WHERE id=$1", [userId]);
  const user = target.rows[0];
  if (!user) throw new Error("用户不存在");
  const removesActiveAdmin = user.role === "admin" && user.enabled && (nextRole !== undefined && nextRole !== "admin" || nextEnabled === false);
  if (!removesActiveAdmin) return;
  const admins = await getPool().query<{ count: string }>("SELECT COUNT(*)::text AS count FROM app_users WHERE role='admin' AND enabled=TRUE");
  if (Number(admins.rows[0]?.count) <= 1) throw new Error("必须至少保留一个启用的管理员账号");
}

export async function createUser(input: UserInput) {
  await ensureSchema();
  if (!input.password) throw new Error("创建本地账号时必须设置初始密码");
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO app_users (id,username,display_name,email,password_hash,role)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, input.username, input.displayName, input.email || null, passwordHash, input.role],
  );
  return id;
}

export async function updateUser(id: string, input: Omit<UserInput, "password">) {
  await ensureSchema();
  await protectLastAdmin(id, input.role, undefined);
  const result = await getPool().query(
    `UPDATE app_users SET username=$2,display_name=$3,email=$4,role=$5,updated_at=NOW()
     WHERE id=$1`,
    [id, input.username, input.displayName, input.email || null, input.role],
  );
  if (!result.rowCount) throw new Error("用户不存在");
  if (input.role === "admin") {
    await Promise.all([
      getPool().query("DELETE FROM user_server_grants WHERE user_id=$1", [id]),
      getPool().query("DELETE FROM user_database_grants WHERE user_id=$1", [id]),
    ]);
  }
}

export async function setUserEnabled(id: string, enabled: boolean, currentUserId: string) {
  await ensureSchema();
  if (!enabled && id === currentUserId) throw new Error("不能禁用当前登录账号");
  await protectLastAdmin(id, undefined, enabled);
  const result = await getPool().query("UPDATE app_users SET enabled=$2,updated_at=NOW() WHERE id=$1", [id, enabled]);
  if (!result.rowCount) throw new Error("用户不存在");
  if (!enabled) await getPool().query("DELETE FROM auth_sessions WHERE user_id=$1", [id]);
}

export async function resetUserPassword(id: string, password: string) {
  await ensureSchema();
  const passwordHash = await hashPassword(password);
  const result = await getPool().query("UPDATE app_users SET password_hash=$2,updated_at=NOW() WHERE id=$1", [id, passwordHash]);
  if (!result.rowCount) throw new Error("用户不存在");
  await getPool().query("DELETE FROM auth_sessions WHERE user_id=$1", [id]);
}

export async function removeUser(id: string, currentUserId: string) {
  await ensureSchema();
  if (id === currentUserId) throw new Error("不能删除当前登录账号");
  await protectLastAdmin(id, "operator", false);
  const result = await getPool().query("DELETE FROM app_users WHERE id=$1", [id]);
  if (!result.rowCount) throw new Error("用户不存在");
}
