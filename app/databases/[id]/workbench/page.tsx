import { notFound } from "next/navigation";
import { listDatabaseSchemas, listManagedDatabases } from "@/lib/database-management";
import DatabaseWorkbenchView from "./workbench-view";

export const dynamic = "force-dynamic";

export default async function DatabaseWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = (await listManagedDatabases()).find((item) => item.id === id);
  if (!database) notFound();
  let schemas: string[] = [];
  let structureError: string | undefined;
  try {
    schemas = await listDatabaseSchemas(id);
  } catch (error) {
    structureError = error instanceof Error ? error.message : "数据库结构读取失败";
  }
  return (
    <DatabaseWorkbenchView
      database={database}
      schemas={schemas}
      structureError={structureError}
    />
  );
}
