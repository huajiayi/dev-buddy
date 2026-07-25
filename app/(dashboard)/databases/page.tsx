"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { DatabaseGrant } from "@/lib/authorization";
import type { ManagedDatabase } from "@/lib/database-management";
import type { ManagedServer } from "@/lib/server-management";
import DatabasesView from "./databases-view";

type DatabasesPageData = {
  databases: ManagedDatabase[];
  servers: ManagedServer[];
  isAdmin: boolean;
  grants: DatabaseGrant[];
};

export default function DatabasesPage() {
  const state = useUiData<DatabasesPageData>("databases");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <DatabasesView {...data} />}
  </UiDataState>;
}
