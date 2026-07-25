"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { SshTerminalSession } from "@/lib/server-management";
import TerminalSessionsView from "./terminal-sessions-view";

export default function TerminalSessionsPage() {
  const state = useUiData<{ sessions: SshTerminalSession[] }>("terminal-sessions");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <TerminalSessionsView sessions={data.sessions} />}
  </UiDataState>;
}
