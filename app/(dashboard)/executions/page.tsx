import { listCommandExecutions } from "@/lib/server-management";
import ExecutionsView from "./executions-view";

export const dynamic = "force-dynamic";

export default async function ExecutionsPage() {
  return <ExecutionsView executions={await listCommandExecutions()} />;
}
