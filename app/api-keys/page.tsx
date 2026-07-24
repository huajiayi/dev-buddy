import { listProjectApiKeys } from "@/lib/server-management";
import ApiKeysView from "./api-keys-view";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const user = await requirePageUser();
  return <ApiKeysView apiKeys={await listProjectApiKeys(user.id)} />;
}
