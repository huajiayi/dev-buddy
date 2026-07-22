import { listSshTerminalSessions } from "@/lib/server-management";
import TerminalSessionsView from "./terminal-sessions-view";

export const dynamic = "force-dynamic";

export default async function TerminalSessionsPage() {
  return <TerminalSessionsView sessions={await listSshTerminalSessions()} />;
}
