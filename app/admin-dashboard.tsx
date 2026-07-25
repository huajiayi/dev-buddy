"use client";

import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined, SafetyCertificateOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { App, Avatar, Breadcrumb, Button, Checkbox, Flex, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, theme } from "antd";
import type { TableColumnsType } from "antd";
import { useMemo, useState, useTransition } from "react";
import type { AppUser, UserRole } from "@/lib/auth";
import type { ManagedServer } from "@/lib/server-management";
import type { ManagedDatabase } from "@/lib/database-management";
import type { DatabaseGrant, ServerGrant } from "@/lib/authorization";
import { formatDateTime } from "@/lib/date-format";
import { createUserAction, deleteUserAction, resetPasswordAction, saveUserResourceGrantsAction, toggleUserAction, updateUserAction, type UserFormInput } from "./users/actions";
import { useRefreshUiData } from "./ui-data";

const { Title, Text } = Typography;
const roleMeta: Record<UserRole, { label: string; color: string }> = {
  admin: { label: "管理员", color: "red" },
  operator: { label: "运维人员", color: "blue" },
};

type Props = {
  users: AppUser[];
  currentUserId: string;
  servers: ManagedServer[];
  databases: ManagedDatabase[];
  serverGrants: ServerGrant[];
  databaseGrants: DatabaseGrant[];
  hasDefaultUserPassword: boolean;
};

export default function UserManagement({
  users, currentUserId, servers, databases, serverGrants, databaseGrants, hasDefaultUserPassword,
}: Props) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const refresh = useRefreshUiData();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"all" | "enabled" | "disabled">("all");
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null);
  const [permissionUser, setPermissionUser] = useState<AppUser | null>(null);
  const [serverPermissions, setServerPermissions] = useState<Record<string, boolean>>({});
  const [databasePermissions, setDatabasePermissions] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const [form] = Form.useForm<UserFormInput & { confirmPassword?: string }>();
  const [passwordForm] = Form.useForm<{ password: string; confirmPassword: string }>();

  const filteredUsers = useMemo(() => users.filter((user) => {
    const value = keyword.trim().toLowerCase();
    const matches = !value || [user.displayName, user.username, user.email || ""].some((item) => item.toLowerCase().includes(value));
    return matches && (status === "all" || user.enabled === (status === "enabled"));
  }), [keyword, status, users]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(user: AppUser) {
    setEditing(user);
    setModalOpen(true);
  }

  function openPermissions(user: AppUser) {
    setPermissionUser(user);
    setServerPermissions(Object.fromEntries(
      serverGrants.filter((item) => item.userId === user.id).map((item) => [item.serverId, true]),
    ));
    setDatabasePermissions(Object.fromEntries(
      databaseGrants.filter((item) => item.userId === user.id).map((item) => [item.databaseId, item.canExecuteSql]),
    ));
  }

  const columns: TableColumnsType<AppUser> = [
    { title: "用户", dataIndex: "displayName", width: 210, render: (_, user) => <Flex align="center" gap={12}><Avatar src={user.avatarUrl} style={{ backgroundColor: token.colorPrimaryBg, color: token.colorPrimary }} icon={<UserOutlined />} /><div><Text strong>{user.displayName}{user.id === currentUserId && <Tag className="current-user-tag">当前</Tag>}</Text><div><Text type="secondary" className="user-subtext">@{user.username}</Text></div></div></Flex> },
    { title: "邮箱", dataIndex: "email", width: 220, render: (value: string | null) => value || "-" },
    { title: "登录方式", width: 150, render: (_, user) => <Space size={4} wrap>{user.hasPassword && <Tag>密码</Tag>}{user.larkConnected && <Tag color="cyan">Lark</Tag>}{!user.hasPassword && !user.larkConnected && <Tag>未配置</Tag>}</Space> },
    { title: "角色", dataIndex: "role", width: 110, render: (role: UserRole) => <Tag color={roleMeta[role].color}>{roleMeta[role].label}</Tag> },
    { title: "状态", dataIndex: "enabled", width: 105, render: (enabled: boolean, user) => <Switch checked={enabled} checkedChildren="启用" unCheckedChildren="禁用" disabled={user.id === currentUserId || pending} onChange={(checked) => startTransition(async () => { const result = await toggleUserAction(user.id, checked); if (result.ok) { message.success(checked ? "用户已启用" : "用户已禁用"); refresh(); } else message.error(result.error); })} /> },
    { title: "最近登录", dataIndex: "lastLoginAt", width: 180, render: (value: string | null) => value ? formatDateTime(value) : "从未登录" },
    { title: "操作", fixed: "right", width: 280, render: (_, user) => <Space size={2}><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(user)}>编辑</Button><Button type="text" size="small" icon={<SafetyCertificateOutlined />} disabled={user.role === "admin"} onClick={() => openPermissions(user)}>资源权限</Button><Button type="text" size="small" icon={<KeyOutlined />} disabled={user.id === currentUserId} onClick={() => setPasswordUser(user)}>重置密码</Button><Popconfirm title="确定删除这个用户吗？" description="用户的登录会话、API Key 和资源授权都会失效" okText="删除" cancelText="取消" disabled={user.id === currentUserId} onConfirm={() => startTransition(async () => { const result = await deleteUserAction(user.id); if (result.ok) { message.success("用户已删除"); refresh(); } else message.error(result.error); })}><Button type="text" size="small" danger disabled={user.id === currentUserId} icon={<DeleteOutlined />} aria-label="删除用户" /></Popconfirm></Space> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "用户管理" }]} />
    <div className="page-heading"><div><Title level={2}>用户管理</Title><Text type="secondary">管理登录账号、Lark 身份、角色和账号状态</Text></div><Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button></div>
    <section className="content-card">
      <div className="table-toolbar"><Space wrap size={12}><Input allowClear prefix={<SearchOutlined />} placeholder="搜索姓名、用户名或邮箱" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="search-input" /><Select value={status} onChange={setStatus} options={[{ label: "全部状态", value: "all" }, { label: "已启用", value: "enabled" }, { label: "已禁用", value: "disabled" }]} className="status-select" /></Space><Text type="secondary">共 {filteredUsers.length} 位用户</Text></div>
      <Table<AppUser> rowKey="id" columns={columns} dataSource={filteredUsers} scroll={{ x: 1165 }} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }} />
    </section>

    <Modal title={editing ? "编辑用户" : "新增用户"} open={modalOpen} okText={editing ? "保存" : "创建用户"} cancelText="取消" confirmLoading={pending} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} destroyOnHidden afterOpenChange={(visible) => { if (!visible) return; form.resetFields(); form.setFieldsValue(editing ? { username: editing.username, displayName: editing.displayName, email: editing.email || "", role: editing.role, password: "", confirmPassword: "" } : { username: "", displayName: "", email: "", role: "operator", password: "", confirmPassword: "" }); }}>
      <Form<UserFormInput & { confirmPassword?: string }> form={form} layout="vertical" onFinish={(values) => startTransition(async () => {
        const result = editing ? await updateUserAction(editing.id, values) : await createUserAction(values);
        if (!result.ok) { message.error(result.error); return; }
        setModalOpen(false); message.success(editing ? "用户已更新" : "用户已创建"); refresh();
      })} className="user-form">
        <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input maxLength={100} /></Form.Item>
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }, { pattern: /^[A-Za-z0-9._-]{3,64}$/, message: "请输入 3–64 位有效用户名" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="email" label="邮箱" rules={[{ type: "email", message: "请输入有效邮箱" }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="role" label="角色" rules={[{ required: true }]}><Select options={Object.entries(roleMeta).map(([value, item]) => ({ value, label: item.label }))} /></Form.Item>
        {!editing && <><Form.Item
          name="password"
          label="初始密码"
          extra={hasDefaultUserPassword ? "留空将使用系统设置中的默认密码" : "尚未配置默认密码，创建时必须填写"}
          rules={[{
            validator(_, value?: string) {
              if (!value && hasDefaultUserPassword) return Promise.resolve();
              if (!value) return Promise.reject(new Error("请输入初始密码，或先配置系统默认密码"));
              return value.length >= 8 && value.length <= 128
                ? Promise.resolve()
                : Promise.reject(new Error("密码需要为 8–128 个字符"));
            },
          }]}
        ><Input.Password autoComplete="new-password" /></Form.Item><Form.Item
          name="confirmPassword"
          label="确认密码"
          dependencies={["password"]}
          rules={[({ getFieldValue }) => ({
            validator(_, value) {
              const password = getFieldValue("password");
              if (!password && !value) return Promise.resolve();
              if (!value) return Promise.reject(new Error("请确认密码"));
              return value === password ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致"));
            },
          })]}
        ><Input.Password autoComplete="new-password" /></Form.Item></>}
      </Form>
    </Modal>

    <Modal title={`重置 ${passwordUser?.displayName || "用户"} 的密码`} open={Boolean(passwordUser)} okText="重置密码" cancelText="取消" confirmLoading={pending} onCancel={() => setPasswordUser(null)} onOk={() => passwordForm.submit()} destroyOnHidden afterOpenChange={(visible) => { if (visible) passwordForm.resetFields(); }}>
      <Form form={passwordForm} layout="vertical" onFinish={(values) => passwordUser && startTransition(async () => { const result = await resetPasswordAction(passwordUser.id, values.password); if (!result.ok) { message.error(result.error); return; } setPasswordUser(null); message.success("密码已重置，用户的已有会话已失效"); refresh(); })}>
        <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 个字符" }]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="confirmPassword" label="确认新密码" dependencies={["password"]} rules={[{ required: true, message: "请确认新密码" }, ({ getFieldValue }) => ({ validator(_, value) { return !value || value === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")); } })]}><Input.Password autoComplete="new-password" /></Form.Item>
      </Form>
    </Modal>

    <Modal
      width={860}
      title={`${permissionUser?.displayName || "运维人员"}的资源权限`}
      open={Boolean(permissionUser)}
      okText="保存权限"
      cancelText="取消"
      confirmLoading={pending}
      onCancel={() => setPermissionUser(null)}
      onOk={() => permissionUser && startTransition(async () => {
        const result = await saveUserResourceGrantsAction({
          userId: permissionUser.id,
          serverIds: Object.entries(serverPermissions).filter(([, enabled]) => enabled).map(([id]) => id),
          databaseIds: Object.entries(databasePermissions).filter(([, enabled]) => enabled).map(([id]) => id),
        });
        if (!result.ok) { message.error(result.error); return; }
        setPermissionUser(null);
        message.success("资源权限已保存");
        refresh();
      })}
      destroyOnHidden
    >
      <Text type="secondary">未勾选的资源默认不可见。服务器权限同时允许受控终端、SSH 终端和测试连接。</Text>
      <Title level={5}>服务器</Title>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        scroll={{ y: 220 }}
        dataSource={servers}
        columns={[
          { title: "服务器", render: (_, item) => `${item.name}（${item.environment}）` },
          { title: "服务器权限", width: 140, render: (_, item) => <Checkbox checked={serverPermissions[item.id] || false} onChange={(event) => setServerPermissions((current) => ({ ...current, [item.id]: event.target.checked }))} /> },
        ]}
        locale={{ emptyText: "暂无服务器" }}
      />
      <Title level={5}>数据库</Title>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        scroll={{ y: 220 }}
        dataSource={databases}
        columns={[
          { title: "数据库", render: (_, item) => `${item.name} / ${item.databaseName}（${item.environment}）` },
          { title: "SQL 工作台", width: 140, render: (_, item) => <Checkbox checked={databasePermissions[item.id] || false} onChange={(event) => setDatabasePermissions((current) => ({ ...current, [item.id]: event.target.checked }))} /> },
        ]}
        locale={{ emptyText: "暂无数据库" }}
      />
    </Modal>
  </>;
}
