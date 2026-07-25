"use client";

import { Suspense } from "react";
import { Result, Skeleton } from "antd";
import { useSearchParams } from "next/navigation";
import { UiDataState, useUiData } from "@/app/ui-data";
import type { AliyunOverview } from "@/lib/aliyun";
import type { AliyunAccount } from "@/lib/aliyun-accounts";
import AccountDetail from "../aliyun/[id]/account-detail";

type AccountPageData = {
  account: AliyunAccount;
  overview?: AliyunOverview;
  error?: string;
};

function AccountContent() {
  const id = useSearchParams().get("id") || "";
  const state = useUiData<AccountPageData>("aliyun-account", id, Boolean(id));
  if (!id) return <Result status={404} title="缺少阿里云账号 ID" />;
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <AccountDetail {...data} />}
  </UiDataState>;
}

export default function AliyunAccountPage() {
  return <Suspense fallback={<Skeleton active />}><AccountContent /></Suspense>;
}
