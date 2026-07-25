import { listManagedDatabases } from "@/lib/database-management";
import { listManagedServers } from "@/lib/server-management";
import DatabasesView from "./databases-view";
import { requirePageUser } from "@/lib/auth";
import { accessibleDatabaseIds, listUserResourceGrants } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function DatabasesPage() {
  const user = await requirePageUser();
  const [databases, servers, ids, grants] = await Promise.all([
    listManagedDatabases(),
    listManagedServers(),
    accessibleDatabaseIds(user),
    listUserResourceGrants(user.id),
  ]);
  return (
    <DatabasesView
      databases={ids ? databases.filter((item) => ids.has(item.id)) : databases}
      servers={user.role === "admin" ? servers : []}
      isAdmin={user.role === "admin"}
      grants={grants.databaseGrants}
    />
  );
}
