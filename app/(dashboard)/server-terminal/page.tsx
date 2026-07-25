"use client";

import { Suspense } from "react";
import { Result, Skeleton } from "antd";
import { useSearchParams } from "next/navigation";
import { UiDataState, useUiData } from "@/app/ui-data";
import type { ManagedServer } from "@/lib/server-management";
import ServerTerminalView from "../servers/[id]/terminal/terminal-view";

function TerminalContent() {
  const id = useSearchParams().get("id") || "";
  const state = useUiData<{ server: ManagedServer }>("server", id, Boolean(id));
  if (!id) return <Result status={404} title="缺少服务器 ID" />;
  return <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
    {(data) => <ServerTerminalView server={data.server} />}
  </UiDataState>;
}

export default function ServerTerminalPage() {
  return <Suspense fallback={<Skeleton active />}><TerminalContent /></Suspense>;
}
