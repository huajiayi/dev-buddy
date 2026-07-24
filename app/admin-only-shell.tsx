import type { ReactNode } from "react";
import { requirePageAdmin } from "@/lib/auth";
import AdminShell from "./admin-shell";

export default async function AdminOnlyShell({ children }: { children: ReactNode }) {
  const user = await requirePageAdmin();
  return <AdminShell currentUser={user}>{children}</AdminShell>;
}
