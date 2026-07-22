"use client";

import { CheckCircleOutlined, ExclamationCircleOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Card, Collapse, Empty, Space, Statistic, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { AccountRisks, CloudRisk } from "@/lib/aliyun-insights";
import InsightHeader from "../insight-header";

const { Text } = Typography;
const levelMeta = {
  critical: { label: "高风险", color: "red" },
  warning: { label: "需关注", color: "orange" },
  info: { label: "建议", color: "blue" },
} as const;

export default function RisksView({ data }: { data: AccountRisks[] }) {
  const all = data.flatMap((group) => group.risks);
  const columns: TableColumnsType<CloudRisk> = [
    { title: "等级", dataIndex: "level", width: 100, render: (value: CloudRisk["level"]) => <Tag color={levelMeta[value].color}>{levelMeta[value].label}</Tag> },
    { title: "类别", dataIndex: "category", width: 100 },
    { title: "风险项", width: 230, render: (_, item) => <div><Text strong>{item.title}</Text>{item.resource && <div><Text type="secondary" className="user-subtext">{item.resource}</Text></div>}</div> },
    { title: "说明", dataIndex: "detail" },
  ];

  return <>
    <InsightHeader title="风险提醒" description="检查余额、资源到期、实例状态、地域可用性和 AccessKey 安全" />
    <div className="stats-grid">
      <Card><Statistic title="高风险" value={all.filter((item) => item.level === "critical").length} prefix={<ExclamationCircleOutlined />} styles={{ content: { color: "#cf1322" } }} /></Card>
      <Card><Statistic title="需关注" value={all.filter((item) => item.level === "warning").length} prefix={<WarningOutlined />} styles={{ content: { color: "#d46b08" } }} /></Card>
      <Card><Statistic title="优化建议" value={all.filter((item) => item.level === "info").length} prefix={<SafetyCertificateOutlined />} /></Card>
      <Card><Statistic title="健康账号" value={data.filter((item) => item.risks.length === 0 && item.unavailable.length === 0).length} prefix={<CheckCircleOutlined />} styles={{ content: { color: "#389e0d" } }} /></Card>
    </div>
    {data.length === 0 ? <Card className="detail-card"><Empty description="请先添加阿里云账号" /></Card> : <Collapse className="risk-collapse" defaultActiveKey={data.map((item) => item.account.id)} items={data.map((group) => ({
      key: group.account.id,
      label: <Space><Text strong>{group.account.name}</Text><Tag color={group.account.site === "international" ? "purple" : "blue"}>{group.account.site === "international" ? "国际站" : "中国站"}</Tag><Tag color={group.risks.some((item) => item.level === "critical") ? "red" : group.risks.length ? "orange" : "green"}>{group.risks.length ? `${group.risks.length} 项提醒` : "未发现风险"}</Tag></Space>,
      children: <Space orientation="vertical" size={14} className="risk-account-content">
        {group.unavailable.map((message) => <Alert key={message} type="warning" showIcon title="部分检查不可用" description={message} />)}
        <Text type="secondary">已完成：{group.checked.length ? group.checked.join("、") : "暂无可用检查项"}</Text>
        {group.risks.length ? <Table<CloudRisk> rowKey="id" columns={columns} dataSource={group.risks} pagination={false} scroll={{ x: 760 }} /> : <Alert type="success" showIcon title="当前未发现需要处理的风险" />}
      </Space>,
    }))} />}
  </>;
}
