"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import type { AppUser, UserRole } from "@/lib/auth";
import type { ManagedDatabase } from "@/lib/database-management";
import type { OnboardingSignals } from "@/lib/onboarding";
import type { CommandExecution, ManagedServer, ProjectApiKey } from "@/lib/server-management";
import HomeDashboard from "./home-dashboard";

export type HomePageData = {
  user: Pick<AppUser, "id" | "displayName" | "username" | "role">;
  servers: ManagedServer[];
  databases: ManagedDatabase[];
  apiKeys: ProjectApiKey[];
  recentExecutions: CommandExecution[];
  signals: OnboardingSignals;
  counts: {
    users: number;
    operators: number;
    servers: number;
    databases: number;
  };
  role: UserRole;
};

export default function Home() {
  const state = useUiData<HomePageData>("home");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <HomeDashboard {...data} refresh={state.mutate} />}
  </UiDataState>;
}
