import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/lib/auth";
import SetupView from "./setup-view";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUsers()) redirect("/login");
  return <SetupView />;
}
