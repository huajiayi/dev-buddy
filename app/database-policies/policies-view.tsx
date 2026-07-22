"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Breadcrumb, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState, useTransition } from "react";
import type { DatabaseQueryPolicy } from "@/lib/database-management";
import { createPolicy, deletePolicy, editPolicy, type DatabasePolicyInput } from "./actions";
import NoticePopover from "@/app/notice-popover";

const { Title, Text } = Typography;
export default function DatabasePoliciesView({ policies }: { policies: DatabaseQueryPolicy[] }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DatabasePolicyInput>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DatabaseQueryPolicy>();
  const [pending, startTransition] = useTransition();
  const close = () => { setOpen(false); setEditing(undefined); form.resetFields(); };
  const create = () => { setEditing(undefined); form.setFieldsValue({ name: "", pattern: "", action: "deny", priority: 50, enabled: true }); setOpen(true); };
  const edit = (item: DatabaseQueryPolicy) => { setEditing(item); form.setFieldsValue(item); setOpen(true); };
  const submit = (values: DatabasePolicyInput) => startTransition(async () => {
    const result = editing ? await editPolicy(editing.id, values) : await createPolicy(values);
    if (!result.ok) { message.error(result.error); return; }
    message.success(editing ? "SQL 策略已更新" : "SQL 策略已创建"); close();
  });
  const columns: TableColumnsType<DatabaseQueryPolicy> = [
    { title: "优先级", dataIndex: "priority", width: 90 },
    { title: "名称", dataIndex: "name", width: 190, render: (value) => <Text strong>{value}</Text> },
    { title: "SQL 正则表达式", dataIndex: "pattern", render: (value) => <Text code>{value}</Text> },
    { title: "动作", dataIndex: "action", width: 90, render: (value) => <Tag color={value === "allow" ? "green" : "red"}>{value === "allow" ? "允许" : "拒绝"}</Tag> },
    { title: "状态", dataIndex: "enabled", width: 90, render: (value) => value ? <Tag color="success">启用</Tag> : <Tag>停用</Tag> },
    { title: "操作", width: 140, render: (_, item) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => edit(item)}>编辑</Button><Popconfirm title="确认删除该策略？" onConfirm={() => startTransition(async () => { const result = await deletePolicy(item.id); if (result.ok) message.success("策略已删除"); else message.error(result.error); })}><Button danger type="text" icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];
  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "数据库管理" }, { title: "SQL 策略" }]} />
    <div className="page-heading"><div><Title level={2}>SQL 执行策略<NoticePopover title="写操作需要显式允许" description="未匹配策略时，单条只读 SQL 默认允许，INSERT、UPDATE、DELETE、DDL 等默认拒绝。请优先创建范围精确的 allow，并用更高优先级的 deny 保护敏感表或高危操作。" /></Title><Text type="secondary">按优先级使用正则匹配完整 SQL，第一条命中的策略生效</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={create}>新增策略</Button></div>
    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={policies} pagination={false} locale={{ emptyText: "暂无自定义策略，当前仅允许内置只读 SQL" }} /></Card>
    <Modal title={editing ? "编辑 SQL 策略" : "新增 SQL 策略"} open={open} onCancel={close} onOk={() => form.submit()} confirmLoading={pending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="允许更新任务状态" /></Form.Item>
        <Form.Item name="pattern" label="SQL 正则表达式" extra="按完整 SQL 进行不区分大小写匹配" rules={[{ required: true }]}><Input.TextArea rows={4} placeholder="^UPDATE\s+jobs\s+SET\s+status\s*=" /></Form.Item>
        <Space align="start"><Form.Item name="action" label="动作"><Select className="policy-action-select" options={[{ value: "allow", label: "允许" }, { value: "deny", label: "拒绝" }]} /></Form.Item><Form.Item name="priority" label="优先级"><InputNumber min={1} max={100} /></Form.Item><Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Space>
      </Form>
    </Modal>
  </>;
}
