import { notFound } from "next/navigation";
import { listManagedServers } from "@/lib/server-management";
import SshTerminalView from "./ssh-terminal-view";

export const dynamic = "force-dynamic";

export default async function SshTerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = (await listManagedServers()).find((item) => item.id === id);
  if (!server) notFound();
  return <SshTerminalView server={server} />;
}
