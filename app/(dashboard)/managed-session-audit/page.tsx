"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { ManagedSession } from "@/lib/managed-sessions";
import ManagedSessionsView from "../managed-sessions/managed-sessions-view";

export default function ManagedSessionAuditPage() {
  const state = useUiData<{ sessions: ManagedSession[] }>("managed-session-audit");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ManagedSessionsView sessions={data.sessions} servers={[]} databases={[]} adminMode />}
  </UiDataState>;
}
