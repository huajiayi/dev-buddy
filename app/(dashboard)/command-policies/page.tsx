import { listCommandPolicies } from "@/lib/server-management";
import PoliciesView from "./policies-view";
import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CommandPoliciesPage() {
  await requirePageAdmin();
  return <PoliciesView policies={await listCommandPolicies()} />;
}
