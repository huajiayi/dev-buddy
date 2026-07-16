"use client";

import { DollarOutlined, FallOutlined, LineChartOutlined, WalletOutlined } from "@ant-design/icons";
import { Alert, Card, Empty, Statistic, Table, Tabs, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import type { AccountCosts, ProductCost } from "@/lib/aliyun-insights";
import InsightHeader from "../insight-header";

const { Text } = Typography;

function money(value: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(value);
}

export default function CostsView({ data }: { data: AccountCosts[] }) {
  const latest = data.flatMap((item) => item.months.slice(-1));
  const columns: TableColumnsType<ProductCost> = [
    { title: "产品", dataIndex: "product" },
    { title: "原始消费", dataIndex: "gross", align: "right", render: (value: number, item) => money(value, item.currency) },
    { title: "优惠金额", dataIndex: "discount", align: "right", render: (value: number, item) => <Text type="success">-{money(value, item.currency)}</Text> },
    { title: "优惠后应付", dataIndex: "payable", align: "right", render: (value: number, item) => money(value, item.currency) },
  ];

  return <>
    <InsightHeader title="费用分析" description="查看最近 6 个月费用趋势、本月产品构成和优惠后应付金额" />
    <div className="stats-grid">
      <Card><Statistic title="已接入账号" value={data.length} prefix={<WalletOutlined />} /></Card>
      <Card><Statistic title="本月有消费账号" value={latest.filter((item) => item.gross > 0).length} prefix={<DollarOutlined />} /></Card>
      <Card><Statistic title="本月账单产品" value={data.reduce((total, item) => total + item.products.length, 0)} prefix={<LineChartOutlined />} /></Card>
      <Card><Statistic title="检测到优惠账号" value={latest.filter((item) => item.discount > 0).length} prefix={<FallOutlined />} /></Card>
    </div>
    {data.length === 0 ? <Card className="detail-card"><Empty description="请先添加阿里云账号" /></Card> : <Card className="detail-card cost-tabs"><Tabs items={data.map((group) => ({
      key: group.account.id,
      label: <span>{group.account.name} <Tag color={group.account.site === "international" ? "purple" : "blue"}>{group.account.site === "international" ? "国际站" : "中国站"}</Tag></span>,
      children: group.error ? <Alert type="warning" showIcon message="账单读取失败" description={group.error} /> : <div className="cost-layout">
        <Card title="近 6 个月消费趋势" className="inner-card">
          <div className="cost-chart" role="img" aria-label={`${group.account.name} 近六个月消费趋势`}>
            {group.months.map((month) => {
              const max = Math.max(...group.months.map((item) => item.gross), 1);
              return <div className="cost-bar-item" key={month.month} title={`${month.month}: ${money(month.gross, month.currency)}`}><div className="cost-bar-value">{money(month.gross, month.currency)}</div><div className="cost-bar-track"><div className="cost-bar" style={{ height: `${Math.max(4, (month.gross / max) * 100)}%` }} /></div><Text type="secondary">{month.month.slice(5)}月</Text></div>;
            })}
          </div>
        </Card>
        <Card title="本月产品费用" className="inner-card"><Table<ProductCost> rowKey={(item) => `${item.product}-${item.currency}`} columns={columns} dataSource={group.products} pagination={false} size="small" locale={{ emptyText: "本月暂无账单" }} /></Card>
      </div>,
    }))} /></Card>}
  </>;
}
