import type { ReactNode } from "react";
import { requirePageUser, type AppUser } from "@/lib/auth";
import AdminShellClient from "./admin-shell-client";

export default async function AdminShell({ children, currentUser }: { children: ReactNode; currentUser?: AppUser }) {
  const user = currentUser || await requirePageUser();
  return <AdminShellClient user={user}>{children}</AdminShellClient>;
}
