"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { AliyunAccount } from "@/lib/aliyun-accounts";
import AccountList from "./account-list";

export default function AliyunAccountsPage() {
  const state = useUiData<{ accounts: AliyunAccount[] }>("aliyun-accounts");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <AccountList accounts={data.accounts} />}
  </UiDataState>;
}
