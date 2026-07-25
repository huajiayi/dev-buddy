"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { DatabaseQueryExecution } from "@/lib/database-management";
import DatabaseExecutionsView from "./database-executions-view";

export default function DatabaseExecutionsPage() {
  const state = useUiData<{ executions: DatabaseQueryExecution[] }>("database-executions");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <DatabaseExecutionsView executions={data.executions} />}
  </UiDataState>;
}
