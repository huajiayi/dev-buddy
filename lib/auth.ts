import "server-only";

import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSchema, getPool } from "./db";

export const SESSION_COOKIE = "dev_buddy_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

export type UserRole = "admin" | "operator";

export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  enabled: boolean;
  hasPassword: boolean;
  larkConnected: boolean;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  role: UserRole;
  enabled: boolean;
  lark_open_id: string | null;
  lark_union_id: string | null;
  lark_tenant_key: string | null;
  avatar_url: string | null;
  last_login_at: Date | null;
  created_at: Date;
};

export type LarkProfile = {
  openId: string;
  unionId: string | null;
  tenantKey: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
};

function toUser(row: UserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    enabled: row.enabled,
    hasPassword: Boolean(row.password_hash),
    larkConnected: Boolean(row.lark_union_id || row.lark_open_id),
    avatarUrl: row.avatar_url,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function deriveKey(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, length, options, (error, value) => error ? reject(error) : resolve(value));
  });
}

export function validatePassword(password: string) {
  if (password.length < 8) return "密码至少需要 8 个字符";
  if (password.length > 128) return "密码不能超过 128 个字符";
  return null;
}

export async function hashPassword(password: string) {
  const error = validatePassword(password);
  if (error) throw new Error(error);
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, nValue, rValue, pValue, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "scrypt" || !nValue || !rValue || !pValue || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await deriveKey(password, Buffer.from(saltValue, "base64url"), expected.length, {
    N: Number(nValue), r: Number(rValue), p: Number(pValue), maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login") || value.startsWith("/auth")) return "/";
  return value;
}

export async function hasAnyUsers() {
  await ensureSchema();
  const result = await getPool().query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM app_users) AS exists");
  return result.rows[0]?.exists ?? false;
}

export async function listUsers() {
  await ensureSchema();
  const result = await getPool().query<UserRow>("SELECT * FROM app_users ORDER BY created_at DESC");
  return result.rows.map(toUser);
}

export async function initializeAdmin(input: { username: string; displayName: string; email?: string; password: string }) {
  await ensureSchema();
  const passwordHash = await hashPassword(input.password);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dev-buddy-initialize-admin'))");
    const count = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM app_users");
    if (Number(count.rows[0]?.count) > 0) throw new Error("系统已经完成初始化");
    const id = randomUUID();
    await client.query(
      `INSERT INTO app_users (id,username,display_name,email,password_hash,role)
       VALUES ($1,$2,$3,$4,$5,'admin')`,
      [id, input.username, input.displayName, input.email || null, passwordHash],
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateLocalUser(account: string, password: string) {
  await ensureSchema();
  const result = await getPool().query<UserRow>(
    "SELECT * FROM app_users WHERE LOWER(username)=LOWER($1) LIMIT 1",
    [account.trim()],
  );
  const row = result.rows[0];
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) return null;
  if (!row.enabled) throw new Error("账号已被禁用，请联系管理员");
  await getPool().query("UPDATE app_users SET last_login_at=NOW() WHERE id=$1", [row.id]);
  return toUser({ ...row, last_login_at: new Date() });
}

export async function createSession(userId: string) {
  await ensureSchema();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await getPool().query("DELETE FROM auth_sessions WHERE expires_at <= NOW()");
  await getPool().query(
    "INSERT INTO auth_sessions (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,$4)",
    [randomUUID(), userId, tokenHash(token), expiresAt],
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureSchema();
    await getPool().query("DELETE FROM auth_sessions WHERE token_hash=$1", [tokenHash(token)]);
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureSchema();
  const result = await getPool().query<UserRow>(
    `SELECT u.* FROM auth_sessions s
     JOIN app_users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.enabled=TRUE
     LIMIT 1`,
    [tokenHash(token)],
  );
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("登录状态已失效，请重新登录");
  return user;
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePageAdmin() {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/servers");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("只有管理员可以执行此操作");
  return user;
}

function larkUsername(profile: LarkProfile) {
  const source = profile.email?.split("@")[0] || `lark_${profile.openId.slice(-10)}`;
  return source.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 48) || `lark_${randomBytes(5).toString("hex")}`;
}

export async function findOrCreateLarkUser(profile: LarkProfile) {
  await ensureSchema();
  const allowedTenants = (process.env.LARK_ALLOWED_TENANT_KEYS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (allowedTenants.length && (!profile.tenantKey || !allowedTenants.includes(profile.tenantKey))) {
    throw new Error("当前 Lark 企业不在允许登录的范围内");
  }

  const identity = await getPool().query<UserRow>(
    `SELECT * FROM app_users
     WHERE ($1::text IS NOT NULL AND lark_union_id=$1) OR lark_open_id=$2
     LIMIT 1`,
    [profile.unionId, profile.openId],
  );
  let row = identity.rows[0];
  if (!row && profile.email) {
    const emailMatch = await getPool().query<UserRow>("SELECT * FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1", [profile.email]);
    row = emailMatch.rows[0];
  }
  if (row) {
    if (!row.enabled) throw new Error("账号已被禁用，请联系管理员");
    const updated = await getPool().query<UserRow>(
      `UPDATE app_users SET lark_open_id=$2,lark_union_id=COALESCE($3,lark_union_id),
       lark_tenant_key=$4,avatar_url=COALESCE($5,avatar_url),last_login_at=NOW(),updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [row.id, profile.openId, profile.unionId, profile.tenantKey, profile.avatarUrl],
    );
    return toUser(updated.rows[0]);
  }
  if (process.env.LARK_AUTO_PROVISION === "false") throw new Error("该 Lark 用户尚未在系统中创建");

  const base = larkUsername(profile);
  let username = base;
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const exists = await getPool().query("SELECT 1 FROM app_users WHERE LOWER(username)=LOWER($1)", [username]);
    if (!exists.rowCount) break;
    username = `${base.slice(0, 44)}_${suffix}`;
  }
  const result = await getPool().query<UserRow>(
    `INSERT INTO app_users
     (id,username,display_name,email,role,lark_open_id,lark_union_id,lark_tenant_key,avatar_url,last_login_at)
     VALUES ($1,$2,$3,$4,'operator',$5,$6,$7,$8,NOW()) RETURNING *`,
    [randomUUID(), username, profile.name || username, profile.email, profile.openId, profile.unionId, profile.tenantKey, profile.avatarUrl],
  );
  return toUser(result.rows[0]);
}
