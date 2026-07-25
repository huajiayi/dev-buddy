"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { ServerGrant } from "@/lib/authorization";
import type { ManagedServer } from "@/lib/server-management";
import ServersView from "./servers-view";

type ServersPageData = {
  servers: ManagedServer[];
  isAdmin: boolean;
  grants: ServerGrant[];
};

export default function ServersPage() {
  const state = useUiData<ServersPageData>("servers");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ServersView {...data} />}
  </UiDataState>;
}
