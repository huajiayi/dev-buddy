"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { ProjectApiKey } from "@/lib/server-management";
import ApiKeysView from "./api-keys-view";

type ApiKeysPageData = { apiKeys: ProjectApiKey[] };

export default function ApiKeysPage() {
  const state = useUiData<ApiKeysPageData>("api-keys");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ApiKeysView apiKeys={data.apiKeys} />}
  </UiDataState>;
}
