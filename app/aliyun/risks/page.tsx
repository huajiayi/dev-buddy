import { listAliyunCredentials } from "@/lib/aliyun-accounts";
import { fetchAccountRisks } from "@/lib/aliyun-insights";
import RisksView from "./risks-view";

export const dynamic = "force-dynamic";

export default async function RisksPage() {
  const accounts = await listAliyunCredentials();
  const data = await Promise.all(accounts.map(fetchAccountRisks));
  return <RisksView data={data} />;
}
