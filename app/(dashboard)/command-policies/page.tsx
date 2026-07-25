"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { CommandPolicy } from "@/lib/server-management";
import PoliciesView from "./policies-view";

export default function CommandPoliciesPage() {
  const state = useUiData<{ policies: CommandPolicy[] }>("command-policies");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <PoliciesView policies={data.policies} />}
  </UiDataState>;
}
