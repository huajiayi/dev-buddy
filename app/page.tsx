import { redirect } from "next/navigation";
import AdminDashboard from "./admin-dashboard";
import AdminShell from "./admin-shell";
import { listUsers, requirePageUser } from "@/lib/auth";
import { listManagedServers } from "@/lib/server-management";
import { listManagedDatabases } from "@/lib/database-management";
import { listResourceGrants } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await requirePageUser();
  if (currentUser.role !== "admin") redirect("/servers");
  const [users, servers, databases, grants] = await Promise.all([
    listUsers(),
    listManagedServers(),
    listManagedDatabases(),
    listResourceGrants(),
  ]);
  return (
    <AdminShell currentUser={currentUser}>
      <AdminDashboard
        users={users}
        currentUserId={currentUser.id}
        servers={servers}
        databases={databases}
        {...grants}
      />
    </AdminShell>
  );
}
