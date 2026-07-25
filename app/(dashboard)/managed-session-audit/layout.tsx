import type { ReactNode } from "react";
import AdminOnlyShell from "@/app/admin-only-shell";

export default function ManagedSessionAuditLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
