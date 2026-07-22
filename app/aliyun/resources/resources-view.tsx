"use client";

import { AppstoreOutlined, CloudOutlined, EnvironmentOutlined, TagsOutlined } from "@ant-design/icons";
import { Alert, Card, Empty, Input, Space, Statistic, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useMemo, useState } from "react";
import type { AccountResources, CloudResource } from "@/lib/aliyun-insights";
import InsightHeader from "../insight-header";

const { Text } = Typography;
type ResourceRow = CloudResource & { key: string; accountName: string; site: "china" | "international" };

export default function ResourcesView({ data }: { data: AccountResources[] }) {
  const [keyword, setKeyword] = useState("");
  const rows = useMemo(() => data.flatMap((group) => group.resources.map((item) => ({ ...item, key: `${group.account.id}-${item.type}-${item.id}`, accountName: group.account.name, site: group.account.site }))), [data]);
  const filtered = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return term ? rows.filter((item) => [item.name, item.id, item.product, item.type, item.region, item.accountName].some((value) => value.toLowerCase().includes(term))) : rows;
  }, [keyword, rows]);
  const products = new Set(rows.map((item) => item.product)).size;
  const regions = new Set(rows.map((item) => item.region)).size;
  const tagged = rows.filter((item) => item.tags.length > 0).length;
  const columns: TableColumnsType<ResourceRow> = [
    { title: "资源", width: 240, render: (_, item) => <div><Text strong>{item.name}</Text><div><Text type="secondary" className="user-subtext">{item.id}</Text></div></div> },
    { title: "产品 / 类型", width: 210, render: (_, item) => <div><Tag color="blue">{item.product}</Tag><div><Text type="secondary" className="user-subtext">{item.type}</Text></div></div> },
    { title: "账号", width: 150, render: (_, item) => <div>{item.accountName}<div><Tag color={item.site === "international" ? "purple" : "blue"}>{item.site === "international" ? "国际站" : "中国站"}</Tag></div></div> },
    { title: "地域 / 可用区", width: 170, render: (_, item) => <div>{item.region}<div><Text type="secondary">{item.zone}</Text></div></div> },
    { title: "IP", width: 160, render: (_, item) => item.ips.length ? item.ips.join("、") : "-" },
    { title: "标签", width: 200, render: (_, item) => item.tags.length ? <Space size={[4, 4]} wrap>{item.tags.slice(0, 3).map((tag) => <Tag key={`${tag.key}-${tag.value}`}>{tag.key}:{tag.value}</Tag>)}</Space> : "-" },
    { title: "到期时间", dataIndex: "expiresAt", width: 170, render: (value: string) => value ? new Date(value).toLocaleString("zh-CN") : "-" },
  ];

  return <>
    <InsightHeader title="全部资源" description="跨账号、跨产品和跨地域汇总当前 AccessKey 有权查看的云资源" />
    {data.filter((item) => item.error).map((item) => <Alert key={item.account.id} type="warning" showIcon className="detail-alert" title={`${item.account.name} 无法读取资源中心`} description={item.error} />)}
    <div className="stats-grid">
      <Card><Statistic title="资源总数" value={rows.length} prefix={<CloudOutlined />} /></Card>
      <Card><Statistic title="云产品" value={products} prefix={<AppstoreOutlined />} /></Card>
      <Card><Statistic title="覆盖地域" value={regions} prefix={<EnvironmentOutlined />} /></Card>
      <Card><Statistic title="已打标签" value={tagged} prefix={<TagsOutlined />} suffix={`/ ${rows.length}`} /></Card>
    </div>
    <Card className="detail-card" title="资源清单" extra={<Input.Search allowClear placeholder="搜索名称、ID、产品或地域" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="resource-search" />}>
      {data.length === 0 ? <Empty description="请先添加阿里云账号" /> : <Table<ResourceRow> rowKey="key" columns={columns} dataSource={filtered} scroll={{ x: 1320 }} pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `共 ${total} 项` }} />}
    </Card>
  </>;
}
