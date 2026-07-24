"use client";

import { Breadcrumb, Button, Card, Descriptions, Modal, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState } from "react";
import type { DatabaseQueryExecution } from "@/lib/database-management";

const { Title, Text, Paragraph } = Typography;
export default function DatabaseExecutionsView({ executions }: { executions: DatabaseQueryExecution[] }) {
  const [selected, setSelected] = useState<DatabaseQueryExecution>();
  const columns: TableColumnsType<DatabaseQueryExecution> = [
    { title: "数据库", dataIndex: "databaseName", width: 160 },
    { title: "SQL", dataIndex: "sql", ellipsis: true, render: (value) => <Text code>{value}</Text> },
    { title: "调用身份", width: 180, render: (_, item) => <div><Text>{item.actorUserName || "历史记录"}</Text><div><Text type="secondary">{item.source === "admin-workbench" ? "后台工作台" : item.apiKeyName || "已删除 Key"}</Text></div></div> },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag color={value === "success" ? "success" : value === "rejected" ? "warning" : "error"}>{value}</Tag> },
    { title: "语句类型", dataIndex: "statementType", width: 110 },
    { title: "策略", dataIndex: "policyDecision", width: 90, render: (value) => <Tag color={value === "allow" ? "green" : "red"}>{value}</Tag> },
    { title: "行数", dataIndex: "rowCount", width: 80 },
    { title: "截断", dataIndex: "truncated", width: 70, render: (value) => value ? "是" : "否" },
    { title: "耗时", dataIndex: "durationMs", width: 100, render: (value) => value == null ? "-" : `${value} ms` },
    { title: "时间", dataIndex: "createdAt", width: 180, render: (value) => new Date(value).toLocaleString("zh-CN") },
    { title: "操作", width: 80, render: (_, item) => <Button type="link" onClick={() => setSelected(item)}>详情</Button> },
  ];
  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "数据库管理" }, { title: "SQL 执行审计" }]} />
    <div className="page-heading"><div><Title level={2}>SQL 执行审计</Title><Text type="secondary">审计只保存元数据，不保存查询结果行</Text></div></div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={executions} scroll={{ x: 1200 }} /></Card>
    <Modal title="SQL 执行详情" open={Boolean(selected)} onCancel={() => setSelected(undefined)} footer={null} width={760}>
      {selected && <><Descriptions column={2} items={[
        { key: "db", label: "数据库", children: selected.databaseName },
        { key: "key", label: "调用方", children: selected.source === "admin-workbench" ? "后台工作台" : selected.apiKeyName || "已删除 Key" },
        { key: "actor", label: "操作用户", children: selected.actorUserName || "历史记录" },
        { key: "status", label: "状态", children: selected.status },
        { key: "statementType", label: "语句类型", children: selected.statementType },
        { key: "policyDecision", label: "策略决策", children: selected.policyDecision },
        { key: "duration", label: "耗时", children: `${selected.durationMs ?? "-"} ms` },
        { key: "rows", label: "返回行数", children: selected.rowCount },
        { key: "truncated", label: "是否截断", children: selected.truncated ? "是" : "否" },
        { key: "reason", label: "原因", children: selected.reason || "-", span: 2 },
        { key: "policyReason", label: "策略原因", children: selected.policyReason || "-", span: 2 },
        { key: "error", label: "错误", children: selected.error || "-", span: 2 },
      ]} /><Paragraph><Text strong>SQL</Text></Paragraph><Paragraph code copyable>{selected.sql}</Paragraph></>}
    </Modal>
  </>;
}
