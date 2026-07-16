"use client";

import { useTransition } from "react";
import { ArrowLeftOutlined, CloudServerOutlined, DatabaseOutlined, DollarOutlined, ReloadOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Alert, Breadcrumb, Button, Card, Descriptions, Statistic, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useRouter } from "next/navigation";
import type { AliyunAccount } from "@/lib/aliyun-accounts";
import type { AliyunOverview, EcsInstanceSummary } from "@/lib/aliyun";

const { Title, Text } = Typography;

function money(value: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(value);
}

export default function AccountDetail({ account, overview, error }: { account: AliyunAccount; overview?: AliyunOverview; error?: string }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const instanceColumns: TableColumnsType<EcsInstanceSummary> = [
    { title: "实例", dataIndex: "name", width: 190, render: (_, item) => <div><Text strong>{item.name}</Text><div><Text type="secondary" className="user-subtext">{item.id}</Text></div></div> },
    { title: "地域 / 可用区", width: 160, render: (_, item) => <div>{item.region}<div><Text type="secondary">{item.zone}</Text></div></div> },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <Tag color={value === "Running" ? "success" : value === "Stopped" ? "default" : "processing"}>{value}</Tag> },
    { title: "规格", dataIndex: "instanceType", width: 150 },
    { title: "资源", width: 120, render: (_, item) => `${item.cpu} vCPU / ${Math.round(item.memoryMb / 1024)} GB` },
    { title: "公网 IP", dataIndex: "publicIp", width: 140 },
    { title: "付费方式", dataIndex: "chargeType", width: 110, render: (value: string) => value === "PrePaid" ? "包年包月" : value === "PostPaid" ? "按量付费" : value },
  ];
  const billColumns: TableColumnsType<AliyunOverview["productBills"][number]> = [
    { title: "产品", dataIndex: "product" },
    { title: "原始消费", dataIndex: "grossAmount", align: "right", render: (value: number, item) => money(value, item.currency) },
    { title: "优惠后应付", dataIndex: "amount", align: "right", render: (value: number, item) => money(value, item.currency) },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "阿里云账号管理" }, { title: account.name }]} />
    <div className="detail-heading"><div><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/aliyun")}>返回账号列表</Button><Title level={2}>{account.name}</Title><Text type="secondary">{account.site === "international" ? "Alibaba Cloud 国际站" : "阿里云中国站"} · {account.accessKeyId.slice(0, 6)}****{account.accessKeyId.slice(-4)} · 自动扫描全部可用地域</Text></div><Button icon={<ReloadOutlined />} loading={isRefreshing} onClick={() => startRefresh(() => router.refresh())}>{isRefreshing ? "正在刷新" : "刷新数据"}</Button></div>
    {error && <Alert type="error" showIcon message="阿里云数据读取失败" description={error} className="detail-alert" />}
    {overview && <>
      {overview.regionErrors.length > 0 && <Alert type="warning" showIcon message="部分地域读取失败" description={overview.regionErrors.map((item) => `${item.region}: ${item.message}`).join("；")} className="detail-alert" />}
      <div className="stats-grid">
        <Card><Statistic title="可用余额" value={overview.balance.available} precision={2} prefix={<DollarOutlined />} suffix={overview.balance.currency} /></Card>
        <Card><Statistic title={`${overview.billingCycle} 原始消费`} value={overview.monthGrossSpend} precision={2} prefix={<ThunderboltOutlined />} suffix={overview.balance.currency} /><Text type="secondary">优惠后应付 {money(overview.monthSpend, overview.balance.currency)}</Text></Card>
        <Card><Statistic title="ECS 实例" value={overview.ecs.total} prefix={<CloudServerOutlined />} suffix="台" /></Card>
        <Card><Statistic title="已分配资源" value={overview.ecs.vcpus} prefix={<DatabaseOutlined />} suffix={`vCPU / ${overview.ecs.memoryGb.toFixed(0)} GB`} /></Card>
      </div>
      <Card title="资源概览" className="detail-card">
        <Descriptions column={{ xs: 1, sm: 2, md: 4 }} items={[
          { key: "regions", label: "已发现地域", children: `${overview.regions.length} 个` },
          { key: "running", label: "运行中", children: `${overview.ecs.running} 台` },
          { key: "stopped", label: "已停止", children: `${overview.ecs.stopped} 台` },
          { key: "cash", label: "现金余额", children: money(overview.balance.cash, overview.balance.currency) },
          { key: "credit", label: "信用额度", children: money(overview.balance.credit, overview.balance.currency) },
        ]} />
      </Card>
      <div className="detail-columns">
        <Card title="ECS 实例明细" className="detail-card wide-card"><Table<EcsInstanceSummary> rowKey={(item) => `${item.region}-${item.id}`} columns={instanceColumns} dataSource={overview.instances} scroll={{ x: 970 }} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: "配置地域中暂无 ECS 实例" }} /></Card>
        <Card title="本月产品消费" extra={<Text type="secondary">账单约延迟 1 天</Text>} className="detail-card bill-card"><Table rowKey={(item) => `${item.product}-${item.currency}`} columns={billColumns} dataSource={overview.productBills} pagination={false} size="small" locale={{ emptyText: "暂无账单数据" }} /></Card>
      </div>
    </>}
  </>;
}
