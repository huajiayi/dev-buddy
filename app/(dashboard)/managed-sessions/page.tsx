"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { ManagedDatabase } from "@/lib/database-management";
import type { ManagedSession } from "@/lib/managed-sessions";
import type { ManagedServer } from "@/lib/server-management";
import ManagedSessionsView from "./managed-sessions-view";

export type ManagedSessionsPageData = {
  sessions: ManagedSession[];
  servers: ManagedServer[];
  databases: ManagedDatabase[];
  readiness: {
    hasResource: boolean;
    hasApiKey: boolean;
    hasAgentConnection: boolean;
    hasFirstCheck: boolean;
  };
  onboardingReady: boolean;
};

export default function ManagedSessionsPage() {
  const state = useUiData<ManagedSessionsPageData>("managed-sessions");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ManagedSessionsView {...data} />}
  </UiDataState>;
}
