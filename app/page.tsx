import { redirect } from "next/navigation";
import AdminDashboard from "./admin-dashboard";
import AdminShell from "./admin-shell";
import { listUsers, requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await requirePageUser();
  if (currentUser.role !== "admin") redirect("/servers");
  return <AdminShell currentUser={currentUser}><AdminDashboard users={await listUsers()} currentUserId={currentUser.id} /></AdminShell>;
}
