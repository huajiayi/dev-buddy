"use client";

import { useMemo, useState } from "react";
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { App, Avatar, Breadcrumb, Button, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, theme } from "antd";
import type { TableColumnsType } from "antd";
import AdminShell from "./admin-shell";

const { Title, Text } = Typography;
type UserStatus = "正常" | "停用";
type UserRecord = { key: number; name: string; username: string; email: string; role: string; status: UserStatus; createdAt: string };
type UserFormValues = Omit<UserRecord, "key" | "createdAt">;

const initialUsers: UserRecord[] = [
  { key: 1, name: "张伟", username: "zhangwei", email: "zhangwei@example.com", role: "管理员", status: "正常", createdAt: "2026-07-12" },
  { key: 2, name: "李娜", username: "lina", email: "lina@example.com", role: "运营人员", status: "正常", createdAt: "2026-07-10" },
  { key: 3, name: "王强", username: "wangqiang", email: "wangqiang@example.com", role: "普通用户", status: "停用", createdAt: "2026-07-08" },
  { key: 4, name: "陈晨", username: "chenchen", email: "chenchen@example.com", role: "普通用户", status: "正常", createdAt: "2026-07-05" },
  { key: 5, name: "刘洋", username: "liuyang", email: "liuyang@example.com", role: "运营人员", status: "正常", createdAt: "2026-07-01" },
];

function UserManagement() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [users, setUsers] = useState(initialUsers);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<UserStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<UserFormValues>();
  const filteredUsers = useMemo(() => users.filter((user) => {
    const value = keyword.trim().toLowerCase();
    return (!value || [user.name, user.username, user.email].some((item) => item.toLowerCase().includes(value))) && (status === "all" || user.status === status);
  }), [keyword, status, users]);

  const columns: TableColumnsType<UserRecord> = [
    { title: "用户", dataIndex: "name", width: 190, render: (_, record) => <Flex align="center" gap={12}><Avatar style={{ backgroundColor: token.colorPrimaryBg, color: token.colorPrimary }} icon={<UserOutlined />} /><div><Text strong>{record.name}</Text><div><Text type="secondary" className="user-subtext">@{record.username}</Text></div></div></Flex> },
    { title: "邮箱", dataIndex: "email", width: 220 },
    { title: "角色", dataIndex: "role", width: 120 },
    { title: "状态", dataIndex: "status", width: 90, render: (value: UserStatus) => <Tag color={value === "正常" ? "success" : "default"}>{value}</Tag> },
    { title: "创建时间", dataIndex: "createdAt", width: 125 },
    { title: "操作", width: 120, render: (_, record) => <Space size={4}><Button type="text" size="small" icon={<EditOutlined />} onClick={() => message.info("编辑功能可在接入接口后补充")}>编辑</Button><Popconfirm title="确定删除这个用户吗？" okText="删除" cancelText="取消" onConfirm={() => { setUsers((current) => current.filter((user) => user.key !== record.key)); message.success("用户已删除"); }}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "用户管理" }]} />
    <div className="page-heading"><div><Title level={2}>用户管理</Title><Text type="secondary">管理系统用户、角色和账号状态</Text></div><Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增用户</Button></div>
    <section className="content-card">
      <div className="table-toolbar"><Space wrap size={12}><Input allowClear prefix={<SearchOutlined />} placeholder="搜索姓名、用户名或邮箱" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="search-input" /><Select value={status} onChange={setStatus} options={[{ label: "全部状态", value: "all" }, { label: "正常", value: "正常" }, { label: "停用", value: "停用" }]} className="status-select" /></Space><Text type="secondary">共 {filteredUsers.length} 位用户</Text></div>
      <Table<UserRecord> columns={columns} dataSource={filteredUsers} scroll={{ x: 865 }} pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} />
    </section>
    <Modal title="新增用户" open={modalOpen} okText="创建用户" cancelText="取消" onCancel={() => { setModalOpen(false); form.resetFields(); }} onOk={() => form.submit()} destroyOnHidden>
      <Form<UserFormValues> form={form} layout="vertical" initialValues={{ role: "普通用户", status: "正常" }} onFinish={(values) => { setUsers((current) => [{ ...values, key: Date.now(), createdAt: new Intl.DateTimeFormat("zh-CN").format(new Date()).replaceAll("/", "-") }, ...current]); form.resetFields(); setModalOpen(false); message.success("用户已添加"); }} className="user-form">
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input /></Form.Item>
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}><Input /></Form.Item>
        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}><Input /></Form.Item>
        <Form.Item name="role" label="角色"><Select options={[{ value: "管理员" }, { value: "运营人员" }, { value: "普通用户" }]} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={[{ value: "正常" }, { value: "停用" }]} /></Form.Item>
      </Form>
    </Modal>
  </>;
}

export default function AdminDashboard() { return <AdminShell><UserManagement /></AdminShell>; }
