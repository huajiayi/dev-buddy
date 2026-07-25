import { notFound } from "next/navigation";
import AccountDetail from "./account-detail";
import { getAliyunAccount } from "@/lib/aliyun-accounts";
import { fetchAliyunOverview } from "@/lib/aliyun";

export const dynamic = "force-dynamic";

export default async function AliyunAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const credential = await getAliyunAccount(id);
  if (!credential) notFound();
  const { accessKeySecret, ...account } = credential;

  let overview;
  let loadError: string | undefined;
  try {
    overview = await fetchAliyunOverview({ accessKeyId: account.accessKeyId, accessKeySecret, site: account.site });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "阿里云接口调用失败";
  }
  return <AccountDetail account={account} overview={overview} error={loadError} />;
}
