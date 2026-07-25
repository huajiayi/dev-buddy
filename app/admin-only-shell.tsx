"use client";

import type { ReactNode } from "react";
import { Result } from "antd";
import { useCurrentUser } from "./admin-shell-client";

export default function AdminOnlyShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (!user) return null;
  if (user.role !== "admin") {
    return <Result status={403} title="403" subTitle="只有管理员可以访问此页面" />;
  }
  return children;
}
