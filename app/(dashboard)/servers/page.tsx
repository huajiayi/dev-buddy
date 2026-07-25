import { listManagedServers } from "@/lib/server-management";
import ServersView from "./servers-view";
import { requirePageUser } from "@/lib/auth";
import { accessibleServerIds, listUserResourceGrants } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const user = await requirePageUser();
  const [servers, ids, grants] = await Promise.all([
    listManagedServers(),
    accessibleServerIds(user),
    listUserResourceGrants(user.id),
  ]);
  return (
    <ServersView
      servers={ids ? servers.filter((item) => ids.has(item.id)) : servers}
      isAdmin={user.role === "admin"}
      grants={grants.serverGrants}
    />
  );
}
