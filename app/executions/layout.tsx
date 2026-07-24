import type { ReactNode } from "react";
import AdminOnlyShell from "../admin-only-shell";

export default function ExecutionsLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
