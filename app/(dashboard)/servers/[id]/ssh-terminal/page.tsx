import { notFound } from "next/navigation";
import { listManagedServers } from "@/lib/server-management";
import SshTerminalView from "./ssh-terminal-view";
import { requirePageUser } from "@/lib/auth";
import { canAccessServer } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function SshTerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  if (!await canAccessServer(user, id)) notFound();
  const server = (await listManagedServers()).find((item) => item.id === id);
  if (!server) notFound();
  return <SshTerminalView server={server} />;
}
