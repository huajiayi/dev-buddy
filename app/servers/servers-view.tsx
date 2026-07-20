"use client";

import { ApiOutlined, DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Breadcrumb, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, Upload } from "antd";
import type { TableColumnsType } from "antd";
import type { UploadProps } from "antd";
import { useState, useTransition } from "react";
import type { ManagedServer } from "@/lib/server-management";
import { createServer, deleteServer, editServer, testServerConnection, toggleServer } from "./actions";
import type { ServerInput } from "./actions";

const { Title, Text } = Typography;

export default function ServersView({ servers }: { servers: ManagedServer[] }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ServerInput>();
  const authType = Form.useWatch("authType", form);
  const [open, setOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<ManagedServer>();
  const [uploadedKeyName, setUploadedKeyName] = useState<string>();
  const [testingId, setTestingId] = useState<string>();
  const [pending, startTransition] = useTransition();

  const closeModal = () => {
    setOpen(false);
    setEditingServer(undefined);
    setUploadedKeyName(undefined);
    form.resetFields();
  };
  const openCreateModal = () => {
    setEditingServer(undefined);
    setUploadedKeyName(undefined);
    form.resetFields();
    form.setFieldsValue({ port: 22, authType: "privateKey", environment: "production" });
    setOpen(true);
  };
  const openEditModal = (server: ManagedServer) => {
    setEditingServer(server);
    setUploadedKeyName(undefined);
    form.setFieldsValue({
      name: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.authType,
      environment: server.environment,
      credential: undefined,
    });
    setOpen(true);
  };
  const submit = (values: ServerInput) => startTransition(async () => {
    const result = editingServer
      ? await editServer(editingServer.id, values)
      : await createServer(values);
    if (!result.ok) { message.error(result.error); return; }
    message.success(editingServer ? "服务器已更新" : "服务器已添加");
    closeModal();
  });
  const beforePrivateKeyUpload: UploadProps["beforeUpload"] = async (file) => {
    if (file.size > 64 * 1024) {
      message.error("私钥文件不能超过 64 KB");
      return Upload.LIST_IGNORE;
    }
    const content = (await file.text()).trim();
    if (!/-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----/.test(content)) {
      message.error("未识别到支持的 OpenSSH、PEM 或 PKCS#8 私钥");
      return Upload.LIST_IGNORE;
    }
    form.setFieldValue("credential", content);
    await form.validateFields(["credential"]);
    setUploadedKeyName(file.name);
    message.success("私钥已读取，将随服务器信息加密保存");
    return false;
  };
  const columns: TableColumnsType<ManagedServer> = [
    { title: "服务器", width: 210, render: (_, item) => <div><Text strong>{item.name}</Text><div><Text type="secondary" className="user-subtext">{item.id}</Text></div></div> },
    { title: "连接地址", width: 190, render: (_, item) => <Text code>{item.username}@{item.host}:{item.port}</Text> },
    { title: "认证", dataIndex: "authType", width: 110, render: (value: ManagedServer["authType"]) => value === "privateKey" ? "SSH 私钥" : "密码" },
    { title: "环境", dataIndex: "environment", width: 110, render: (value: string) => <Tag color={value === "production" ? "red" : value === "staging" ? "orange" : "blue"}>{value}</Tag> },
    { title: "启用", dataIndex: "enabled", width: 90, render: (value: boolean, item) => <Switch checked={value} onChange={(checked) => startTransition(async () => { const result = await toggleServer(item.id, checked); if (result.ok) message.success("状态已更新"); else message.error(result.error); })} /> },
    { title: "操作", width: 250, render: (_, item) => <Space><Button type="link" icon={<ApiOutlined />} loading={testingId === item.id} onClick={() => { setTestingId(item.id); startTransition(async () => { const result = await testServerConnection(item.id); if (result.ok) message.success("SSH 连接正常"); else message.error(result.error || "连接测试失败"); setTestingId(undefined); }); }}>测试连接</Button><Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(item)}>编辑</Button><Popconfirm title="确认删除这台服务器？" onConfirm={() => startTransition(async () => { const result = await deleteServer(item.id); if (result.ok) message.success("已删除"); else message.error(result.error); })}><Button danger type="text" icon={<DeleteOutlined />} aria-label={`删除 ${item.name}`} /></Popconfirm></Space> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "服务器运维" }, { title: "服务器列表" }]} />
    <div className="page-heading"><div><Title level={2}>服务器列表</Title><Text type="secondary">管理允许项目 API 执行只读诊断命令的 Linux 服务器</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>添加服务器</Button></div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={servers} scroll={{ x: 1080 }} pagination={{ pageSize: 10 }} locale={{ emptyText: "暂无服务器，请先添加 SSH 连接信息" }} /></Card>
    <Modal title={editingServer ? "编辑 Linux 服务器" : "添加 Linux 服务器"} open={open} onCancel={closeModal} onOk={() => form.submit()} okText={editingServer ? "保存" : "添加"} confirmLoading={pending} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ port: 22, authType: "privateKey", environment: "production" }} onFinish={submit} className="server-form">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="生产环境 Web-01" /></Form.Item>
        <div className="form-grid"><Form.Item name="host" label="IP 或域名" rules={[{ required: true }]}><Input placeholder="10.0.0.10" /></Form.Item><Form.Item name="port" label="SSH 端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} className="full-width" /></Form.Item></div>
        <div className="form-grid"><Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input placeholder="ops" /></Form.Item><Form.Item name="environment" label="环境"><Select options={[{ value: "production", label: "生产" }, { value: "staging", label: "预发" }, { value: "development", label: "开发" }]} /></Form.Item></div>
        <Form.Item name="authType" label="认证方式"><Select onChange={() => setUploadedKeyName(undefined)} options={[{ value: "privateKey", label: "SSH 私钥" }, { value: "password", label: "密码" }]} /></Form.Item>
        {authType === "privateKey" && <div className="private-key-upload"><Upload beforeUpload={beforePrivateKeyUpload} showUploadList={false} maxCount={1}><Button icon={<UploadOutlined />}>选择私钥文件</Button></Upload><Text type="secondary">{uploadedKeyName ? `已读取：${uploadedKeyName}` : "支持 OpenSSH、PEM、PKCS#8，最大 64 KB"}</Text></div>}
        <Form.Item
          name="credential"
          label={authType === "password" ? "密码" : "SSH 私钥"}
          extra={editingServer ? "留空将保留现有凭证；填写或上传后会替换凭证" : undefined}
          rules={[{
            validator: async (_, value?: string) => {
              if (!editingServer && !value?.trim()) throw new Error("请输入密码或私钥");
              if (editingServer && editingServer.authType !== authType && !value?.trim()) {
                throw new Error("更换认证方式时必须填写新的密码或私钥");
              }
            },
          }]}
        >{authType === "password" ? <Input.Password placeholder={editingServer ? "留空则保留现有密码" : "服务器登录密码"} /> : <Input.TextArea autoSize={{ minRows: 5, maxRows: 10 }} placeholder={editingServer ? "留空则保留现有私钥" : "-----BEGIN OPENSSH PRIVATE KEY-----"} />}</Form.Item>
      </Form>
    </Modal>
  </>;
}
