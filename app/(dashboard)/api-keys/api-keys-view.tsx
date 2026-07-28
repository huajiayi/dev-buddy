"use client";

import { CopyOutlined, DeleteOutlined, KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Alert, Breadcrumb, Button, Card, Empty, Input, Modal, Popconfirm, Space, Switch, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectApiKey } from "@/lib/server-management";
import { formatDateTime } from "@/lib/date-format";
import { createApiKey, deleteApiKey, toggleApiKey } from "./actions";
import NoticePopover from "@/app/notice-popover";
import { useRefreshUiData } from "@/app/ui-data";

const { Title, Text, Paragraph } = Typography;

export default function ApiKeysView({ apiKeys }: { apiKeys: ProjectApiKey[] }) {
  const { message } = App.useApp();
  const router = useRouter();
  const refresh = useRefreshUiData();
  const [name, setName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string>();
  const [pending, startTransition] = useTransition();
  const columns: TableColumnsType<ProjectApiKey> = [
    { title: "名称", dataIndex: "name", render: (value: string, item) => <div><Text strong>{value}</Text><div><Text code>{item.prefix}••••••••</Text></div></div> },
    { title: "启用", dataIndex: "enabled", width: 100, render: (enabled: boolean, item) => <Switch checked={enabled} checkedChildren="启用" unCheckedChildren="禁用" onChange={(checked) => startTransition(async () => { const result = await toggleApiKey(item.id, checked); if (result.ok) { message.success(checked ? "API Key 已启用" : "API Key 已禁用"); refresh(); } else message.error(result.error); })} /> },
    { title: "最近使用", dataIndex: "lastUsedAt", width: 180, render: (value: string | null) => value ? formatDateTime(value) : "从未使用" },
    { title: "创建时间", dataIndex: "createdAt", width: 180, render: (value: string) => formatDateTime(value) },
    { title: "操作", width: 100, render: (_, item) => <Popconfirm title="删除后无法恢复，确认继续？" description="删除不会移除已有执行审计记录" onConfirm={() => startTransition(async () => { const result = await deleteApiKey(item.id); if (result.ok) { message.success("API Key 已删除"); refresh(); } else message.error(result.error); })}><Button danger type="text" icon={<DeleteOutlined />}>删除</Button></Popconfirm> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "系统管理" }, { title: "我的 API Key" }]} />
    <div className="page-heading"><div><Title level={2}>我的 API Key<NoticePopover title="密钥只在创建时显示一次" description="API Key 自动绑定当前用户，不配置权限范围；调用能力实时继承你的角色和资源授权。请只通过 Authorization: Bearer 请求头传递。" /></Title><Text type="secondary">供任意支持 Skill 的 Agent 或外部程序以你的身份调用 Dev Buddy</Text></div><Space wrap><Button onClick={() => router.push("/agent-setup")}>Agent 接入向导</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建 API Key</Button></Space></div>
    <Card className="detail-card"><Table
      rowKey="id"
      columns={columns}
      dataSource={apiKeys}
      scroll={{ x: 900 }}
      pagination={false}
      locale={{ emptyText: <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="还没有个人 API Key。创建后可接入任意支持 Skill 的 Agent。"
      ><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建第一个 API Key</Button></Empty> }}
    /></Card>
    <Modal title="创建我的 API Key" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => startTransition(async () => { const result = await createApiKey(name); if (!result.ok) { message.error(result.error); return; } setCreateOpen(false); setName(""); setSecret(result.value); refresh(); })} confirmLoading={pending}><Input prefix={<KeyOutlined />} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Codex 排障 Skill" maxLength={100} /></Modal>
    <Modal title="请立即保存 API Key" open={Boolean(secret)} onCancel={() => setSecret(undefined)} footer={<Space><Button onClick={() => setSecret(undefined)}>我已保存</Button><Button type="primary" onClick={() => { setSecret(undefined); router.push("/agent-setup"); }}>继续配置 Agent</Button></Space>} closable={false} mask={{ closable: false }}>
      <Alert type="warning" showIcon title="关闭后无法再次查看该密钥" />
      <Paragraph copyable={{ text: secret }} className="api-key-secret"><Text code>{secret}</Text></Paragraph>
      <Button icon={<CopyOutlined />} onClick={async () => { if (secret) await navigator.clipboard.writeText(secret); message.success("已复制"); }}>复制 API Key</Button>
    </Modal>
  </>;
}
