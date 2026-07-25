"use client";

import { Suspense } from "react";
import { Result, Skeleton } from "antd";
import { useSearchParams } from "next/navigation";
import { UiDataState, useUiData } from "@/app/ui-data";
import type { ManagedDatabase } from "@/lib/database-management";
import DatabaseWorkbenchView from "../databases/[id]/workbench/workbench-view";

type WorkbenchPageData = {
  database: ManagedDatabase;
  schemas: string[];
  structureError?: string;
};

function WorkbenchContent() {
  const id = useSearchParams().get("id") || "";
  const state = useUiData<WorkbenchPageData>("database-workbench", id, Boolean(id));
  if (!id) return <Result status={404} title="缺少数据库 ID" />;
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <DatabaseWorkbenchView {...data} />}
  </UiDataState>;
}

export default function DatabaseWorkbenchPage() {
  return <Suspense fallback={<Skeleton active />}><WorkbenchContent /></Suspense>;
}
