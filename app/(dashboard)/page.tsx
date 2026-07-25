import { redirect } from "next/navigation";
import AdminDashboard from "@/app/admin-dashboard";
import { listUsers, requirePageUser } from "@/lib/auth";
import { listManagedServers } from "@/lib/server-management";
import { listManagedDatabases } from "@/lib/database-management";
import { listResourceGrants } from "@/lib/authorization";
import { hasDefaultUserPassword } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await requirePageUser();
  if (currentUser.role !== "admin") redirect("/servers");
  const [users, servers, databases, grants, defaultPasswordConfigured] = await Promise.all([
    listUsers(),
    listManagedServers(),
    listManagedDatabases(),
    listResourceGrants(),
    hasDefaultUserPassword(),
  ]);
  return <AdminDashboard
    users={users}
    currentUserId={currentUser.id}
    servers={servers}
    databases={databases}
    hasDefaultUserPassword={defaultPasswordConfigured}
    {...grants}
  />;
}
