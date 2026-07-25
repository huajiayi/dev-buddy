"use client";

import type { ReactNode } from "react";
import AdminShellClient from "./admin-shell-client";

export default function AdminShell({ children }: { children: ReactNode }) {
  return <AdminShellClient>{children}</AdminShellClient>;
}
