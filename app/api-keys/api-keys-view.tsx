"use client";

import { CopyOutlined, DeleteOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Alert, Breadcrumb, Button, Card, Input, Modal, Popconfirm, Switch, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState, useTransition } from "react";
import type { ProjectApiKey } from "@/lib/server-management";
import { createApiKey, deleteApiKey, toggleApiKey } from "./actions";
import NoticePopover from "@/app/notice-popover";

const { Title, Text, Paragraph } = Typography;

export default function ApiKeysView({ apiKeys }: { apiKeys: ProjectApiKey[] }) {
  const { message } = App.useApp();
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string>();
  const [pending, startTransition] = useTransition();
  const columns: TableColumnsType<ProjectApiKey> = [
    { title: "名称", dataIndex: "name", render: (value: string, item) => <div><Text strong>{value}</Text><div><Text code>{item.prefix}••••••••</Text></div></div> },
    { title: "启用", dataIndex: "enabled", width: 100, render: (enabled: boolean, item) => <Switch checked={enabled} checkedChildren="启用" unCheckedChildren="禁用" onChange={(checked) => startTransition(async () => { const result = await toggleApiKey(item.id, checked); if (result.ok) message.success(checked ? "API Key 已启用" : "API Key 已禁用"); else message.error(result.error); })} /> },
    { title: "最近使用", dataIndex: "lastUsedAt", width: 180, render: (value: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "从未使用" },
    { title: "创建时间", dataIndex: "createdAt", width: 180, render: (value: string) => new Date(value).toLocaleString("zh-CN") },
    { title: "操作", width: 100, render: (_, item) => <Popconfirm title="删除后无法恢复，确认继续？" description="删除不会移除已有执行审计记录" onConfirm={() => startTransition(async () => { const result = await deleteApiKey(item.id); if (result.ok) message.success("API Key 已删除"); else message.error(result.error); })}><Button danger type="text" icon={<DeleteOutlined />}>删除</Button></Popconfirm> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "系统管理" }, { title: "API Key" }]} />
    <div className="page-heading"><div><Title level={2}>项目 API Key<NoticePopover title="密钥只在创建时显示一次" description="API Key 当前仅负责身份认证，不携带功能权限范围。请只通过 Authorization: Bearer 请求头传递。" /></Title><Text type="secondary">项目级机器身份，后续权限将由关联用户的角色统一判断</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建 API Key</Button></div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={apiKeys} scroll={{ x: 900 }} pagination={false} locale={{ emptyText: "暂无 API Key" }} /></Card>
    <Modal title="创建项目 API Key" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => startTransition(async () => { const result = await createApiKey(name); if (!result.ok) { message.error(result.error); return; } setCreateOpen(false); setName(""); setSecret(result.value); })} confirmLoading={pending}><Input prefix={<KeyOutlined />} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Codex 排障 Skill" maxLength={100} /></Modal>
    <Modal title="请立即保存 API Key" open={Boolean(secret)} onCancel={() => setSecret(undefined)} footer={<Button type="primary" onClick={() => setSecret(undefined)}>我已保存</Button>} closable={false} mask={{ closable: false }}>
      <Alert type="warning" showIcon title="关闭后无法再次查看该密钥" />
      <Paragraph copyable={{ text: secret }} className="api-key-secret"><Text code>{secret}</Text></Paragraph>
      <Button icon={<CopyOutlined />} onClick={async () => { if (secret) await navigator.clipboard.writeText(secret); message.success("已复制"); }}>复制 API Key</Button>
    </Modal>
  </>;
}
