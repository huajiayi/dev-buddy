import { listAliyunCredentials } from "@/lib/aliyun-accounts";
import { fetchAccountResources } from "@/lib/aliyun-insights";
import ResourcesView from "./resources-view";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const accounts = await listAliyunCredentials();
  const data = await Promise.all(accounts.map(fetchAccountResources));
  return <ResourcesView data={data} />;
}
