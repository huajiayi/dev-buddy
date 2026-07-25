"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { AccountCosts } from "@/lib/aliyun-insights";
import CostsView from "./costs-view";

export default function CostsPage() {
  const state = useUiData<{ data: AccountCosts[] }>("aliyun-costs");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <CostsView data={data.data} />}
  </UiDataState>;
}
