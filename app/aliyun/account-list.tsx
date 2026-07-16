"use client";

import { useState } from "react";
import { CloudServerOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Avatar, Breadcrumb, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useRouter } from "next/navigation";
import type { AliyunAccount } from "@/lib/aliyun-accounts";
import { createAliyunAccount, deleteAliyunAccount, editAliyunAccount } from "./actions";

const { Title, Text } = Typography;
type AccountForm = { name: string; accessKeyId: string; accessKeySecret: string; site: "china" | "international" };

export default function AccountList({ accounts, loadError }: { accounts: AliyunAccount[]; loadError?: string }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AliyunAccount | null>(null);
  const [form] = Form.useForm<AccountForm>();

  const columns: TableColumnsType<AliyunAccount> = [
    { title: "账号", dataIndex: "name", width: 220, render: (_, record) => <Space size={12}><Avatar shape="square" className="aliyun-avatar" icon={<CloudServerOutlined />} /><div><Text strong>{record.name}</Text><div><Text type="secondary" className="user-subtext">{record.accessKeyId.slice(0, 6)}****{record.accessKeyId.slice(-4)}</Text></div></div></Space> },
    { title: "站点", dataIndex: "site", width: 120, render: (site: AliyunAccount["site"]) => <Tag color={site === "international" ? "purple" : "blue"}>{site === "international" ? "国际站" : "中国站"}</Tag> },
    { title: "资源范围", render: () => <Tag color="processing">自动发现全部可用地域</Tag> },
    { title: "添加时间", dataIndex: "createdAt", width: 180, render: (value: string) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) },
    { title: "操作", width: 260, render: (_, record) => <Space><Button type="link" icon={<EyeOutlined />} onClick={() => router.push(`/aliyun/${record.id}`)}>查看详情</Button><Button type="text" icon={<EditOutlined />} onClick={() => { setEditingAccount(record); form.setFieldsValue({ name: record.name, site: record.site, accessKeyId: record.accessKeyId, accessKeySecret: "" }); setOpen(true); }}>编辑</Button><Popconfirm title="确定删除该阿里云账号吗？" description="这只会删除本系统保存的凭据。" okText="删除" cancelText="取消" onConfirm={async () => { const result = await deleteAliyunAccount(record.id); if (result.ok) { message.success("账号已删除"); router.refresh(); } else message.error(result.error); }}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  const submit = async (values: AccountForm) => {
    setSaving(true);
    const result = editingAccount
      ? await editAliyunAccount(editingAccount.id, values)
      : await createAliyunAccount(values);
    setSaving(false);
    if (!result.ok) return message.error(result.error);
    message.success(editingAccount ? "账号已更新" : "阿里云账号已添加");
    setOpen(false);
    setEditingAccount(null);
    form.resetFields();
    router.refresh();
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    form.resetFields();
    form.setFieldsValue({ site: "china" });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditingAccount(null);
    form.resetFields();
  };

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "阿里云账号管理" }]} />
    <div className="page-heading"><div><Title level={2}>阿里云账号管理</Title><Text type="secondary">集中查看账号余额、账单与云资源使用情况</Text></div><Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreateModal}>新增账号</Button></div>
    {loadError ? <div className="error-panel"><Title level={4}>数据库连接失败</Title><Text type="secondary">{loadError}</Text></div> : <section className="content-card"><div className="table-toolbar"><div><Text strong>账号列表</Text><div><Text type="secondary">AccessKey Secret 已加密存储，不会返回到浏览器</Text></div></div><Text type="secondary">共 {accounts.length} 个账号</Text></div><Table<AliyunAccount> rowKey="id" columns={columns} dataSource={accounts} scroll={{ x: 820 }} locale={{ emptyText: "暂无阿里云账号，请先添加" }} pagination={false} /></section>}
    <Modal title={editingAccount ? "编辑阿里云账号" : "新增阿里云账号"} open={open} confirmLoading={saving} okText={editingAccount ? "保存修改" : "保存账号"} cancelText="取消" onOk={() => form.submit()} onCancel={closeModal} destroyOnHidden>
      <Form<AccountForm> form={form} layout="vertical" initialValues={{ site: "china" }} onFinish={submit} className="user-form">
        <Form.Item name="name" label="账号名称" rules={[{ required: true, message: "请输入账号名称" }]}><Input placeholder="例如：生产环境主账号" /></Form.Item>
        <Form.Item name="site" label="阿里云站点" extra="国际站账号请选择 Alibaba Cloud 国际站。" rules={[{ required: true }]}><Select options={[{ value: "china", label: "阿里云中国站" }, { value: "international", label: "Alibaba Cloud 国际站" }]} /></Form.Item>
        <Form.Item name="accessKeyId" label="AccessKey ID" rules={[{ required: true, message: "请输入 AccessKey ID" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="accessKeySecret" label="AccessKey Secret" extra={editingAccount ? "如不需要更换 Secret，请保持为空。" : "仅在服务端加密后保存。建议使用最小权限的 RAM 用户。"} rules={[{ required: !editingAccount, message: "请输入 AccessKey Secret" }]}><Input.Password autoComplete="new-password" placeholder={editingAccount ? "留空表示不修改" : undefined} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
