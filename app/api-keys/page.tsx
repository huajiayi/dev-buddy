import { listProjectApiKeys } from "@/lib/server-management";
import ApiKeysView from "./api-keys-view";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  return <ApiKeysView apiKeys={await listProjectApiKeys()} />;
}
