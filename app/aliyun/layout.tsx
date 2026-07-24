import type { ReactNode } from "react";
import AdminOnlyShell from "../admin-only-shell";

export default function AliyunLayout({ children }: { children: ReactNode }) {
  return <AdminOnlyShell>{children}</AdminOnlyShell>;
}
