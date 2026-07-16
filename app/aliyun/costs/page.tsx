import { listAliyunCredentials } from "@/lib/aliyun-accounts";
import { fetchAccountCosts } from "@/lib/aliyun-insights";
import CostsView from "./costs-view";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const accounts = await listAliyunCredentials();
  const data = await Promise.all(accounts.map(fetchAccountCosts));
  return <CostsView data={data} />;
}
