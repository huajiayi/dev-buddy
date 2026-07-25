import type { ReactNode } from "react";
import { requirePageAdmin } from "@/lib/auth";

export default async function AdminOnlyShell({ children }: { children: ReactNode }) {
  await requirePageAdmin();
  return children;
}
