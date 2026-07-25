"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { Breadcrumb, Button, Typography } from "antd";
import { useTransition } from "react";
import { useRefreshUiData } from "@/app/ui-data";

const { Title, Text } = Typography;

export default function InsightHeader({ title, description }: { title: string; description: string }) {
  const refresh = useRefreshUiData();
  const [refreshing, startTransition] = useTransition();
  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "阿里云账号管理" }, { title }]} />
    <div className="page-heading insight-heading">
      <div><Title level={2}>{title}</Title><Text type="secondary">{description}</Text></div>
      <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => startTransition(refresh)}>{refreshing ? "正在刷新" : "刷新数据"}</Button>
    </div>
  </>;
}
