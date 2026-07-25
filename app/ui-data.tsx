"use client";

import { createContext, type ReactNode, useContext } from "react";
import { Alert, Button, Result, Skeleton } from "antd";
import useSWR from "swr";

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
};

const UiRefreshContext = createContext<() => void>(() => undefined);

export function useRefreshUiData() {
  return useContext(UiRefreshContext);
}

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) {
    const error = new Error(payload.message || "页面数据加载失败") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function useUiData<T>(view: string, id?: string, enabled = true) {
  const query = new URLSearchParams({ view });
  if (id) query.set("id", id);
  return useSWR<T>(enabled ? `/api/ui/page-data?${query.toString()}` : null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });
}

export function UiDataState<T>({
  data,
  error,
  loading,
  retry,
  children,
}: {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  retry: () => void;
  children: (value: T) => ReactNode;
}) {
  if (loading) {
    return <div className="page-loading-state"><Skeleton active paragraph={{ rows: 8 }} /></div>;
  }
  if (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 403 || status === 404) {
      return <Result status={status} title={status} subTitle={error.message} />;
    }
    return <Alert
      type="error"
      showIcon
      title="页面加载失败"
      description={error.message}
      action={<Button size="small" onClick={retry}>重新加载</Button>}
    />;
  }
  return data === undefined
    ? null
    : <UiRefreshContext.Provider value={retry}>{children(data)}</UiRefreshContext.Provider>;
}
