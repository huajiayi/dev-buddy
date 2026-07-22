"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Breadcrumb, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState, useTransition } from "react";
import type { CommandPolicy } from "@/lib/server-management";
import { createPolicy, deletePolicy, editPolicy } from "./actions";
import type { PolicyInput } from "./actions";
import NoticePopover from "@/app/notice-popover";

const { Title, Text } = Typography;

export default function PoliciesView({ policies }: { policies: CommandPolicy[] }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PolicyInput>();
  const [open, setOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CommandPolicy>();
  const [pending, startTransition] = useTransition();
  const closeModal = () => {
    setOpen(false);
    setEditingPolicy(undefined);
    form.resetFields();
  };
  const openCreateModal = () => {
    setEditingPolicy(undefined);
    form.resetFields();
    form.setFieldsValue({ action: "deny", priority: 50, enabled: true });
    setOpen(true);
  };
  const openEditModal = (policy: CommandPolicy) => {
    setEditingPolicy(policy);
    form.setFieldsValue({
      name: policy.name,
      pattern: policy.pattern,
      action: policy.action,
      priority: policy.priority,
      enabled: policy.enabled,
    });
    setOpen(true);
  };
  const columns: TableColumnsType<CommandPolicy> = [
    { title: "优先级", dataIndex: "priority", width: 90 },
    { title: "名称", dataIndex: "name", width: 180, render: (value: string) => <Text strong>{value}</Text> },
    { title: "正则表达式", dataIndex: "pattern", render: (value: string) => <Text code>{value}</Text> },
    { title: "动作", dataIndex: "action", width: 100, render: (value: CommandPolicy["action"]) => <Tag color={value === "allow" ? "green" : "red"}>{value === "allow" ? "允许" : "拒绝"}</Tag> },
    { title: "状态", dataIndex: "enabled", width: 90, render: (value: boolean) => value ? <Tag color="success">启用</Tag> : <Tag>停用</Tag> },
    { title: "操作", width: 130, render: (_, item) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(item)}>编辑</Button><Popconfirm title="确认删除该策略？" onConfirm={() => startTransition(async () => { const result = await deletePolicy(item.id); if (result.ok) message.success("策略已删除"); else message.error(result.error); })}><Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除 ${item.name}`} /></Popconfirm></Space> },
  ];
  const submit = (values: PolicyInput) => startTransition(async () => {
    const result = editingPolicy
      ? await editPolicy(editingPolicy.id, values)
      : await createPolicy(values);
    if (!result.ok) { message.error(result.error); return; }
    message.success(editingPolicy ? "命令策略已更新" : "命令策略已创建");
    closeModal();
  });

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "服务器运维" }, { title: "命令策略" }]} />
    <div className="page-heading"><div><Title level={2}>命令策略<NoticePopover title="未匹配策略时默认允许" description="系统不再内置高危命令或参数拦截。请通过高优先级 deny 策略保护删除、提权、重启和敏感文件访问等操作。" /></Title><Text type="secondary">按优先级匹配正则规则，第一条命中的策略生效</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新增策略</Button></div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={policies} pagination={false} locale={{ emptyText: "暂无自定义策略，普通命令将默认允许" }} /></Card>
    <Modal title={editingPolicy ? "编辑命令策略" : "新增命令策略"} open={open} onCancel={closeModal} onOk={() => form.submit()} okText={editingPolicy ? "保存" : "创建"} confirmLoading={pending} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ action: "deny", priority: 50, enabled: true }} onFinish={submit}>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="允许查看 nginx 配置摘要" /></Form.Item>
        <Form.Item name="pattern" label="命令正则表达式" rules={[{ required: true }]} extra="按完整命令进行不区分大小写匹配"><Input.TextArea rows={3} placeholder="^nginx\s+-T$" /></Form.Item>
        <Space align="start"><Form.Item name="action" label="动作"><Select className="policy-action-select" options={[{ value: "allow", label: "允许" }, { value: "deny", label: "拒绝" }]} /></Form.Item><Form.Item name="priority" label="优先级"><InputNumber min={1} max={100} /></Form.Item><Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Space>
      </Form>
    </Modal>
  </>;
}
