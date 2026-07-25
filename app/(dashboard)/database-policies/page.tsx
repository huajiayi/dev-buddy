"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { DatabaseQueryPolicy } from "@/lib/database-management";
import DatabasePoliciesView from "./policies-view";

export default function DatabasePoliciesPage() {
  const state = useUiData<{ policies: DatabaseQueryPolicy[] }>("database-policies");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <DatabasePoliciesView policies={data.policies} />}
  </UiDataState>;
}
