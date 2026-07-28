"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { DevBuddyVersionInfo } from "@/lib/dev-buddy-version";
import type { ProjectApiKey } from "@/lib/server-management";
import AgentSetupView from "./agent-setup-view";

export type AgentSetupPageData = {
  apiKeys: ProjectApiKey[];
  versionInfo: DevBuddyVersionInfo;
  baseUrl: string;
};

export default function AgentSetupPage() {
  const state = useUiData<AgentSetupPageData>("agent-setup");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <AgentSetupView {...data} />}
  </UiDataState>;
}
