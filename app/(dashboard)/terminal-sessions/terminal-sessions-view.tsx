"use client";

import { Breadcrumb, Card, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { SshTerminalSession } from "@/lib/server-management";
import { formatDateTime } from "@/lib/date-format";

const { Title, Text } = Typography;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function TerminalSessionsView({ sessions }: { sessions: SshTerminalSession[] }) {
  const columns: TableColumnsType<SshTerminalSession> = [
    {
      title: "开始时间",
      dataIndex: "startedAt",
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "服务器",
      width: 220,
      render: (_, item) => <div>
        <Text strong>{item.serverName}</Text>
        <div><Text type="secondary" className="user-subtext">{item.serverId || "服务器已删除"}</Text></div>
      </div>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <Tag color={
        value === "connected" ? "processing" : value === "failed" ? "error" : "default"
      }>{value}</Tag>,
    },
    { title: "操作用户", dataIndex: "actorUserName", width: 140, render: (value) => value || "历史记录" },
    { title: "来源 IP", dataIndex: "remoteAddress", width: 160, render: (value) => value || "-" },
    {
      title: "流量",
      width: 160,
      render: (_, item) => `↑ ${formatBytes(item.bytesIn)} / ↓ ${formatBytes(item.bytesOut)}`,
    },
    {
      title: "结束时间",
      dataIndex: "endedAt",
      width: 180,
      render: (value: string | null) => value ? formatDateTime(value) : "-",
    },
    { title: "结束原因", dataIndex: "closeReason", ellipsis: true, render: (value) => value || "-" },
  ];

  return <>
    <Breadcrumb items={[
      { title: "首页" },
      { title: "服务器运维" },
      { title: "SSH 会话审计" },
    ]} />
    <div className="page-heading">
      <div>
        <Title level={2}>SSH 会话审计</Title>
        <Text type="secondary">记录交互终端的连接状态、来源、持续时间和流量，不保存输入及屏幕内容</Text>
      </div>
    </div>
    <Card className="detail-card">
      <Table
        rowKey="id"
        columns={columns}
        dataSource={sessions}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 15 }}
        locale={{ emptyText: "暂无 SSH 终端会话" }}
      />
    </Card>
  </>;
}
