import type { ReactNode } from "react";
import AdminOnlyShell from "../admin-only-shell";

export default function DatabaseExecutionsLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
