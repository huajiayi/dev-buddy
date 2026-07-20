"use client";

import { CopyOutlined, KeyOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { App, Alert, Breadcrumb, Button, Card, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState, useTransition } from "react";
import type { ProjectApiKey } from "@/lib/server-management";
import { createApiKey, revokeApiKey } from "./actions";

const { Title, Text, Paragraph } = Typography;

export default function ApiKeysView({ apiKeys }: { apiKeys: ProjectApiKey[] }) {
  const { message } = App.useApp();
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string>();
  const [pending, startTransition] = useTransition();
  const columns: TableColumnsType<ProjectApiKey> = [
    { title: "名称", dataIndex: "name", render: (value: string, item) => <div><Text strong>{value}</Text><div><Text code>{item.prefix}••••••••</Text></div></div> },
    { title: "权限范围", dataIndex: "scopes", render: (scopes: string[]) => <Space wrap>{scopes.map((scope) => <Tag color="blue" key={scope}>{scope}</Tag>)}</Space> },
    { title: "状态", width: 100, render: (_, item) => item.revokedAt ? <Tag>已撤销</Tag> : <Tag color="success">有效</Tag> },
    { title: "最近使用", dataIndex: "lastUsedAt", width: 180, render: (value: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "从未使用" },
    { title: "创建时间", dataIndex: "createdAt", width: 180, render: (value: string) => new Date(value).toLocaleString("zh-CN") },
    { title: "操作", width: 100, render: (_, item) => item.revokedAt ? "-" : <Popconfirm title="撤销后无法恢复，确认继续？" onConfirm={() => startTransition(async () => { const result = await revokeApiKey(item.id); if (result.ok) message.success("API Key 已撤销"); else message.error(result.error); })}><Button danger type="text" icon={<StopOutlined />}>撤销</Button></Popconfirm> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "系统管理" }, { title: "API Key" }]} />
    <div className="page-heading"><div><Title level={2}>项目 API Key</Title><Text type="secondary">项目级机器身份，可通过 scope 扩展给后续功能使用</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建 API Key</Button></div>
    <Alert type="info" showIcon className="detail-alert" message="密钥只在创建时显示一次" description="当前默认包含服务器读取、命令执行和命令策略管理权限。请只通过 Authorization: Bearer 请求头传递。" />
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={apiKeys} scroll={{ x: 900 }} pagination={false} locale={{ emptyText: "暂无 API Key" }} /></Card>
    <Modal title="创建项目 API Key" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => startTransition(async () => { const result = await createApiKey(name); if (!result.ok) { message.error(result.error); return; } setCreateOpen(false); setName(""); setSecret(result.value); })} confirmLoading={pending}><Input prefix={<KeyOutlined />} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Codex 排障 Skill" maxLength={100} /></Modal>
    <Modal title="请立即保存 API Key" open={Boolean(secret)} onCancel={() => setSecret(undefined)} footer={<Button type="primary" onClick={() => setSecret(undefined)}>我已保存</Button>} closable={false} maskClosable={false}>
      <Alert type="warning" showIcon message="关闭后无法再次查看该密钥" />
      <Paragraph copyable={{ text: secret }} className="api-key-secret"><Text code>{secret}</Text></Paragraph>
      <Button icon={<CopyOutlined />} onClick={async () => { if (secret) await navigator.clipboard.writeText(secret); message.success("已复制"); }}>复制 API Key</Button>
    </Modal>
  </>;
}
