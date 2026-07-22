import { listManagedDatabases } from "@/lib/database-management";
import { listManagedServers } from "@/lib/server-management";
import DatabasesView from "./databases-view";

export const dynamic = "force-dynamic";

export default async function DatabasesPage() {
  const [databases, servers] = await Promise.all([listManagedDatabases(), listManagedServers()]);
  return <DatabasesView databases={databases} servers={servers} />;
}

