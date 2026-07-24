import { listDatabaseQueryPolicies } from "@/lib/database-management";
import DatabasePoliciesView from "./policies-view";
import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function DatabasePoliciesPage() {
  await requirePageAdmin();
  return <DatabasePoliciesView policies={await listDatabaseQueryPolicies()} />;
}
