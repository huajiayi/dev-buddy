"use client";

import { Breadcrumb, Card, Descriptions, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { CommandExecution } from "@/lib/server-management";

const { Title, Text, Paragraph } = Typography;
const statusColors: Record<string, string> = { success: "green", failed: "red", rejected: "orange", running: "blue" };

export default function ExecutionsView({ executions }: { executions: CommandExecution[] }) {
  const columns: TableColumnsType<CommandExecution> = [
    { title: "时间", dataIndex: "createdAt", width: 180, render: (value: string) => new Date(value).toLocaleString("zh-CN") },
    { title: "服务器", width: 170, render: (_, item) => <div><Text strong>{item.serverName || "已删除服务器"}</Text><div><Text type="secondary" className="user-subtext">{item.serverId}</Text></div></div> },
    { title: "调用方", dataIndex: "apiKeyName", width: 150, render: (value: string | null) => value || "已撤销 Key" },
    { title: "命令", dataIndex: "command", ellipsis: true, render: (value: string) => <Text code>{value}</Text> },
    { title: "策略", dataIndex: "policyDecision", width: 90, render: (value: string) => <Tag color={value === "allow" ? "green" : "red"}>{value}</Tag> },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <Tag color={statusColors[value]}>{value}</Tag> },
    { title: "耗时", dataIndex: "durationMs", width: 100, render: (value: number | null) => value === null ? "-" : `${value} ms` },
  ];
  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "服务器运维" }, { title: "执行审计" }]} />
    <div className="page-heading"><div><Title level={2}>执行审计</Title><Text type="secondary">记录所有 API 命令请求、策略判定和 SSH 输出</Text></div></div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={executions} scroll={{ x: 1100 }} pagination={{ pageSize: 15 }} locale={{ emptyText: "暂无命令执行记录" }} expandable={{ expandedRowRender: (item) => <div className="execution-detail"><Descriptions size="small" column={2} items={[{ key: "reason", label: "执行原因", children: item.reason || "-" }, { key: "policy", label: "策略原因", children: item.policyReason }, { key: "ip", label: "来源 IP", children: item.remoteAddress || "-" }, { key: "exit", label: "退出码", children: item.exitCode ?? "-" }]} /><Text strong>stdout</Text><Paragraph><pre>{item.stdout || "（无输出）"}</pre></Paragraph><Text strong>stderr</Text><Paragraph><pre>{item.stderr || "（无输出）"}</pre></Paragraph></div> }} /></Card>
  </>;
}
