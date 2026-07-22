import { listDatabaseQueryPolicies } from "@/lib/database-management";
import DatabasePoliciesView from "./policies-view";

export const dynamic = "force-dynamic";
export default async function DatabasePoliciesPage() {
  return <DatabasePoliciesView policies={await listDatabaseQueryPolicies()} />;
}

