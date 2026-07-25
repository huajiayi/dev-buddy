"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { CommandExecution } from "@/lib/server-management";
import ExecutionsView from "./executions-view";

export default function ExecutionsPage() {
  const state = useUiData<{ executions: CommandExecution[] }>("executions");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ExecutionsView executions={data.executions} />}
  </UiDataState>;
}
