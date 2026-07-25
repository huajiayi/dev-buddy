import type { ReactNode } from "react";
import AdminOnlyShell from "@/app/admin-only-shell";

export default function SystemSettingsLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
