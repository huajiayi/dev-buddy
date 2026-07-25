import type { ReactNode } from "react";
import AdminOnlyShell from "@/app/admin-only-shell";

export default function DatabasePoliciesLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
