import type { ReactNode } from "react";
import AdminOnlyShell from "../admin-only-shell";

export default function CommandPoliciesLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
