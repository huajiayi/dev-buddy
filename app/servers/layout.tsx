import type { ReactNode } from "react";
import AdminShell from "../admin-shell";

export default function ServersLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
