import type { ReactNode } from "react";
import AdminShell from "../admin-shell";

export default function CommandPoliciesLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
