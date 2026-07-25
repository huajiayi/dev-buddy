import { hasDefaultUserPassword } from "@/lib/system-settings";
import SystemSettingsView from "./system-settings-view";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  return <SystemSettingsView hasDefaultPassword={await hasDefaultUserPassword()} />;
}
