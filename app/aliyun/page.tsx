import AccountList from "./account-list";
import { listAliyunAccounts } from "@/lib/aliyun-accounts";
import type { AliyunAccount } from "@/lib/aliyun-accounts";

export const dynamic = "force-dynamic";

export default async function AliyunAccountsPage() {
  let accounts: AliyunAccount[] = [];
  let loadError: string | undefined;
  try {
    accounts = await listAliyunAccounts();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "无法连接 PostgreSQL";
  }
  return <AccountList accounts={accounts} loadError={loadError} />;
}
