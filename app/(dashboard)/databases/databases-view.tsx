"use client";

import { ApiOutlined, CodeOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Breadcrumb, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, Upload } from "antd";
import type { TableColumnsType, UploadProps } from "antd";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ManagedDatabase } from "@/lib/database-management";
import type { ManagedServer } from "@/lib/server-management";
import type { DatabaseGrant } from "@/lib/authorization";
import { createDatabase, deleteDatabase, editDatabase, testDatabaseConnection, toggleDatabase, type DatabaseInput } from "./actions";
import { useRefreshUiData } from "@/app/ui-data";

const { Title, Text } = Typography;

export default function DatabasesView({ databases, servers, isAdmin, grants }: { databases: ManagedDatabase[]; servers: ManagedServer[]; isAdmin: boolean; grants: DatabaseGrant[] }) {
  const { message } = App.useApp();
  const refresh = useRefreshUiData();
  const router = useRouter();
  const [form] = Form.useForm<DatabaseInput>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedDatabase>();
  const [testingId, setTestingId] = useState<string>();
  const [caName, setCaName] = useState<string>();
  const [pending, startTransition] = useTransition();
  const mode = Form.useWatch("connectionMode", form);
  const grantedIds = new Set(grants.filter((item) => item.canExecuteSql).map((item) => item.databaseId));

  const close = () => { setOpen(false); setEditing(undefined); setCaName(undefined); };
  const create = () => {
    setEditing(undefined);
    setOpen(true);
  };
  const edit = (item: ManagedDatabase) => {
    setEditing(item);
    setOpen(true);
  };
  const submit = (values: DatabaseInput) => startTransition(async () => {
    const result = editing ? await editDatabase(editing.id, values) : await createDatabase(values);
    if (!result.ok) { message.error(result.error); return; }
    message.success(editing ? "数据库已更新" : "数据库已添加"); close(); refresh();
  });
  const uploadCa: UploadProps["beforeUpload"] = async (file) => {
    if (file.size > 64 * 1024) { message.error("CA 文件不能超过 64 KB"); return Upload.LIST_IGNORE; }
    const content = (await file.text()).trim();
    if (!/-----BEGIN CERTIFICATE-----/.test(content)) { message.error("请选择 PEM CA 证书"); return Upload.LIST_IGNORE; }
    form.setFieldValue("tlsCa", content); setCaName(file.name); return false;
  };
  const columns: TableColumnsType<ManagedDatabase> = [
    { title: "数据库", width: 190, render: (_, item) => <div><Text strong>{item.name}</Text><div><Text type="secondary">{item.databaseName}</Text></div></div> },
    { title: "引擎", dataIndex: "engine", width: 110, render: (value) => <Tag color={value === "postgresql" ? "blue" : "orange"}>{value}</Tag> },
    { title: "连接地址", width: 230, render: (_, item) => <Text code>{item.username}@{item.host}:{item.port}</Text> },
    { title: "连接方式", width: 160, render: (_, item) => item.connectionMode === "direct" ? "直连" : `SSH：${item.sshServerName || "未知"}` },
    { title: "TLS", dataIndex: "tlsMode", width: 110 },
    { title: "环境", dataIndex: "environment", width: 100 },
    { title: "启用", width: 90, render: (_, item) => isAdmin ? <Switch checked={item.enabled} onChange={(enabled) => startTransition(async () => { const result = await toggleDatabase(item.id, enabled); if (result.ok) { message.success("状态已更新"); refresh(); } else message.error(result.error); })} /> : <Tag color={item.enabled ? "success" : "default"}>{item.enabled ? "已启用" : "已禁用"}</Tag> },
    { title: "操作", width: isAdmin ? 390 : 260, render: (_, item) => {
      const canOperate = isAdmin || grantedIds.has(item.id);
      return <Space>
        {canOperate && <Button type="link" icon={<CodeOutlined />} disabled={!item.enabled} onClick={() => router.push(`/database-workbench?id=${item.id}`)}>打开工作台</Button>}
        {canOperate && <Button type="link" icon={<ApiOutlined />} disabled={!item.enabled} loading={testingId === item.id} onClick={() => { setTestingId(item.id); startTransition(async () => { const result = await testDatabaseConnection(item.id); if (result.ok) message.success("数据库连接正常"); else message.error(result.error); setTestingId(undefined); }); }}>测试连接</Button>}
        {isAdmin && <><Button type="text" icon={<EditOutlined />} onClick={() => edit(item)}>编辑</Button><Popconfirm title="删除资产后审计记录仍会保留，确认删除？" onConfirm={() => startTransition(async () => { const result = await deleteDatabase(item.id); if (result.ok) { message.success("已删除"); refresh(); } else message.error(result.error); })}><Button danger type="text" icon={<DeleteOutlined />} /></Popconfirm></>}
      </Space>;
    } },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "数据库管理" }, { title: "数据库列表" }]} />
    <div className="page-heading"><div><Title level={2}>关系型数据库</Title><Text type="secondary">{isAdmin ? "管理 PostgreSQL、MySQL/MariaDB 资产；SQL 操作由执行策略控制" : "仅显示管理员已授权给你的数据库"}</Text></div>{isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={create}>添加数据库</Button>}</div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={databases} scroll={{ x: 1360 }} /></Card>
    <Modal width={720} title={editing ? "编辑数据库" : "添加数据库"} open={open} onCancel={close} onOk={() => form.submit()} confirmLoading={pending} destroyOnHidden afterOpenChange={(visible) => { if (!visible) return; form.resetFields(); form.setFieldsValue(editing ? { ...editing, password: undefined, tlsCa: undefined, clearTlsCa: false } : { engine: "postgresql", port: 5432, connectionMode: "direct", tlsMode: "disable", environment: "production", sshServerId: null }); }}>
      <Form form={form} layout="vertical" onFinish={submit}>
        <div className="form-grid"><Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="environment" label="环境"><Select options={["production", "staging", "development"].map((value) => ({ value }))} /></Form.Item></div>
        <div className="form-grid"><Form.Item name="engine" label="引擎" rules={[{ required: true }]}><Select onChange={(engine) => form.setFieldValue("port", engine === "postgresql" ? 5432 : 3306)} options={[{ value: "postgresql", label: "PostgreSQL" }, { value: "mysql", label: "MySQL / MariaDB" }]} /></Form.Item><Form.Item name="databaseName" label="逻辑库" rules={[{ required: true }]}><Input /></Form.Item></div>
        <div className="form-grid"><Form.Item name="host" label="主机" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="port" label="端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} className="full-width" /></Form.Item></div>
        <div className="form-grid"><Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="password" label="密码" extra={editing ? "留空保留现有密码" : undefined} rules={[{ validator: async (_, value) => { if (!editing && !value) throw new Error("请输入密码"); } }]}><Input.Password /></Form.Item></div>
        <div className="form-grid"><Form.Item name="connectionMode" label="连接方式"><Select options={[{ value: "direct", label: "直连" }, { value: "sshTunnel", label: "SSH 隧道" }]} /></Form.Item>{mode === "sshTunnel" && <Form.Item name="sshServerId" label="隧道服务器" rules={[{ required: true }]}><Select options={servers.filter((item) => item.enabled).map((item) => ({ value: item.id, label: `${item.name} (${item.host})` }))} /></Form.Item>}</div>
        <Form.Item name="tlsMode" label="TLS"><Select options={[{ value: "disable", label: "禁用" }, { value: "require", label: "加密但不校验证书" }, { value: "verify-full", label: "完整校验（默认系统 CA）" }]} /></Form.Item>
        <Space align="start"><Upload beforeUpload={uploadCa} showUploadList={false}><Button icon={<UploadOutlined />}>上传自定义 CA</Button></Upload><Text type="secondary">{caName || (editing?.hasCustomCa ? "已配置自定义 CA；留空保留" : "可选，PEM，最大 64 KB")}</Text></Space>
        <Form.Item name="tlsCa" hidden><Input /></Form.Item>
        {editing?.hasCustomCa && <Form.Item name="clearTlsCa" valuePropName="checked"><Checkbox>移除现有自定义 CA，改用系统 CA</Checkbox></Form.Item>}
      </Form>
    </Modal>
  </>;
}
