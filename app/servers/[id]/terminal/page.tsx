import { notFound } from "next/navigation";
import { listManagedServers } from "@/lib/server-management";
import ServerTerminalView from "./terminal-view";

export const dynamic = "force-dynamic";

export default async function ServerTerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = (await listManagedServers()).find((item) => item.id === id);
  if (!server) notFound();
  return <ServerTerminalView server={server} />;
}

