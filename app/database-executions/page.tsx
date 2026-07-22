import { listDatabaseQueryExecutions } from "@/lib/database-management";
import DatabaseExecutionsView from "./database-executions-view";

export const dynamic = "force-dynamic";
export default async function DatabaseExecutionsPage() {
  return <DatabaseExecutionsView executions={await listDatabaseQueryExecutions()} />;
}

