import { listProjectApiKeys } from "@/lib/server-management";
import ApiKeysView from "./api-keys-view";
import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  await requirePageAdmin();
  return <ApiKeysView apiKeys={await listProjectApiKeys()} />;
}
