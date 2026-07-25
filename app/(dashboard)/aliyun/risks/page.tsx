"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { AccountRisks } from "@/lib/aliyun-insights";
import RisksView from "./risks-view";

export default function RisksPage() {
  const state = useUiData<{ data: AccountRisks[] }>("aliyun-risks");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <RisksView data={data.data} />}
  </UiDataState>;
}
