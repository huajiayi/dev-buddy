"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { AccountResources } from "@/lib/aliyun-insights";
import ResourcesView from "./resources-view";

export default function ResourcesPage() {
  const state = useUiData<{ data: AccountResources[] }>("aliyun-resources");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ResourcesView data={data.data} />}
  </UiDataState>;
}
