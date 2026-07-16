import { randomUUID } from "node:crypto";
import { ensureSchema, getPool } from "./db";
import { decryptSecret, encryptSecret } from "./secret";

export type AliyunAccount = {
  id: string;
  name: string;
  accessKeyId: string;
  site: "china" | "international";
  createdAt: string;
};

export type AliyunCredential = AliyunAccount & { accessKeySecret: string };

type AccountRow = {
  id: string;
  name: string;
  access_key_id: string;
  access_key_secret_encrypted: string;
  site: "china" | "international";
  regions: string[];
  created_at: Date;
};

function toAccount(row: AccountRow): AliyunAccount {
  return {
    id: row.id,
    name: row.name,
    accessKeyId: row.access_key_id,
    site: row.site,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listAliyunAccounts() {
  await ensureSchema();
  const result = await getPool().query<AccountRow>(
    "SELECT id, name, access_key_id, access_key_secret_encrypted, site, regions, created_at FROM aliyun_accounts ORDER BY created_at DESC",
  );
  return result.rows.map(toAccount);
}

export async function listAliyunCredentials(): Promise<AliyunCredential[]> {
  await ensureSchema();
  const result = await getPool().query<AccountRow>(
    "SELECT id, name, access_key_id, access_key_secret_encrypted, site, regions, created_at FROM aliyun_accounts ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({ ...toAccount(row), accessKeySecret: decryptSecret(row.access_key_secret_encrypted) }));
}

export async function getAliyunAccount(id: string): Promise<AliyunCredential | null> {
  await ensureSchema();
  const result = await getPool().query<AccountRow>(
    "SELECT id, name, access_key_id, access_key_secret_encrypted, site, regions, created_at FROM aliyun_accounts WHERE id = $1",
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...toAccount(row), accessKeySecret: decryptSecret(row.access_key_secret_encrypted) };
}

export async function insertAliyunAccount(input: {
  name: string;
  accessKeyId: string;
  accessKeySecret: string;
  site: "china" | "international";
}) {
  await ensureSchema();
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO aliyun_accounts (id, name, access_key_id, access_key_secret_encrypted, site, regions)
     VALUES ($1, $2, $3, $4, $5, ARRAY[]::TEXT[])`,
    [id, input.name, input.accessKeyId, encryptSecret(input.accessKeySecret), input.site],
  );
  return id;
}

export async function setAliyunAccountSite(id: string, site: "china" | "international") {
  await ensureSchema();
  await getPool().query("UPDATE aliyun_accounts SET site = $2, updated_at = NOW() WHERE id = $1", [id, site]);
}

export async function updateAliyunAccount(input: {
  id: string;
  name: string;
  accessKeyId: string;
  accessKeySecret?: string;
  site: "china" | "international";
}) {
  await ensureSchema();
  const encryptedSecret = input.accessKeySecret ? encryptSecret(input.accessKeySecret) : null;
  await getPool().query(
    `UPDATE aliyun_accounts
     SET name = $2,
         access_key_id = $3,
         site = $4,
         access_key_secret_encrypted = COALESCE($5, access_key_secret_encrypted),
         updated_at = NOW()
     WHERE id = $1`,
    [input.id, input.name, input.accessKeyId, input.site, encryptedSecret],
  );
}

export async function removeAliyunAccount(id: string) {
  await ensureSchema();
  await getPool().query("DELETE FROM aliyun_accounts WHERE id = $1", [id]);
}
