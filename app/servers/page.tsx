import { listManagedServers } from "@/lib/server-management";
import ServersView from "./servers-view";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  return <ServersView servers={await listManagedServers()} />;
}
