"use client";

import { UiDataState, useUiData } from "@/app/ui-data";
import SystemSettingsView from "./system-settings-view";

export default function SystemSettingsPage() {
  const state = useUiData<{ hasDefaultPassword: boolean }>("system-settings");
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <SystemSettingsView hasDefaultPassword={data.hasDefaultPassword} />}
  </UiDataState>;
}
