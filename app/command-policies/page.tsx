import { listCommandPolicies } from "@/lib/server-management";
import PoliciesView from "./policies-view";

export const dynamic = "force-dynamic";

export default async function CommandPoliciesPage() {
  return <PoliciesView policies={await listCommandPolicies()} />;
}
