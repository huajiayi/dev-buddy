import "server-only";

import { ensureSchema, getPool } from "./db";
import { decryptSecret, encryptSecret } from "./secret";
import { validatePassword } from "./auth";

const DEFAULT_USER_PASSWORD_KEY = "default_user_password";

export async function hasDefaultUserPassword() {
  await ensureSchema();
  const result = await getPool().query(
    "SELECT 1 FROM system_settings WHERE key=$1 LIMIT 1",
    [DEFAULT_USER_PASSWORD_KEY],
  );
  return Boolean(result.rowCount);
}

export async function getDefaultUserPassword() {
  await ensureSchema();
  const result = await getPool().query<{ value_encrypted: string }>(
    "SELECT value_encrypted FROM system_settings WHERE key=$1",
    [DEFAULT_USER_PASSWORD_KEY],
  );
  const encrypted = result.rows[0]?.value_encrypted;
  return encrypted ? decryptSecret(encrypted) : null;
}

export async function setDefaultUserPassword(password: string, updatedBy: string) {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);
  await ensureSchema();
  await getPool().query(
    `INSERT INTO system_settings (key,value_encrypted,updated_by,updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (key) DO UPDATE
       SET value_encrypted=EXCLUDED.value_encrypted,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()`,
    [DEFAULT_USER_PASSWORD_KEY, encryptSecret(password), updatedBy],
  );
}

export async function clearDefaultUserPassword() {
  await ensureSchema();
  await getPool().query("DELETE FROM system_settings WHERE key=$1", [DEFAULT_USER_PASSWORD_KEY]);
}
