"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import {
  AppstoreOutlined, BellOutlined, CloudServerOutlined, CodeOutlined, DatabaseOutlined,
  DesktopOutlined, FileSearchOutlined, HistoryOutlined, KeyOutlined, LineChartOutlined,
  LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SafetyCertificateOutlined,
  SettingOutlined, TeamOutlined,
} from "@ant-design/icons";
import { App, Avatar, Button, ConfigProvider, Dropdown, Flex, Layout, Menu, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import zhCN from "antd/locale/zh_CN";
import { usePathname, useRouter } from "next/navigation";
import type { AppUser, UserRole } from "@/lib/auth";
import { logoutAction } from "./login/actions";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const roleLabels: Record<UserRole, string> = { admin: "管理员", operator: "运维人员", user: "普通用户" };

function Shell({ children, user }: { children: ReactNode; user: AppUser }) {
  const { token } = theme.useToken();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, startLogout] = useTransition();
  const databaseWorkbench = /^\/databases\/[^/]+\/workbench/.test(pathname);
  const sshTerminal = /^\/servers\/[^/]+\/ssh-terminal/.test(pathname);
  const workspaceMode = databaseWorkbench || sshTerminal;
  const selectedKey = ["/database-executions", "/database-policies", "/databases", "/terminal-sessions", "/servers", "/command-policies", "/executions", "/api-keys", "/aliyun/resources", "/aliyun/costs", "/aliyun/risks"].find((key) => pathname.startsWith(key))
    ?? (pathname.startsWith("/aliyun") ? "/aliyun" : "/");
  const accountItems: MenuProps["items"] = [
    { key: "identity", label: <div className="account-menu-identity"><Text strong>{user.displayName}</Text><Text type="secondary">{roleLabels[user.role]}</Text></div>, disabled: true },
    { type: "divider" },
    { key: "logout", label: loggingOut ? "正在退出…" : "退出登录", icon: <LogoutOutlined />, danger: true },
  ];

  const menuItems: MenuProps["items"] = [
    ...(user.role === "admin" ? [{ key: "/", icon: <TeamOutlined />, label: "用户管理" }] : []),
    {
      key: "server-operations", icon: <DesktopOutlined />, label: "服务器运维",
      children: [
        { key: "/servers", icon: <CloudServerOutlined />, label: "服务器列表" },
        ...(user.role === "admin" ? [{ key: "/command-policies", icon: <CodeOutlined />, label: "命令策略" }] : []),
        { key: "/executions", icon: <FileSearchOutlined />, label: "执行审计" },
        { key: "/terminal-sessions", icon: <HistoryOutlined />, label: "SSH 会话审计" },
      ],
    },
    {
      key: "database-management", icon: <DatabaseOutlined />, label: "数据库管理",
      children: [
        { key: "/databases", icon: <DatabaseOutlined />, label: "数据库列表" },
        ...(user.role === "admin" ? [{ key: "/database-policies", icon: <CodeOutlined />, label: "SQL 执行策略" }] : []),
        { key: "/database-executions", icon: <FileSearchOutlined />, label: "SQL 执行审计" },
      ],
    },
    {
      key: "aliyun-management", icon: <CloudServerOutlined />, label: "阿里云管理",
      children: [
        { key: "/aliyun", icon: <KeyOutlined />, label: "账号管理" },
        { key: "/aliyun/resources", icon: <AppstoreOutlined />, label: "全部资源" },
        { key: "/aliyun/costs", icon: <LineChartOutlined />, label: "费用分析" },
        { key: "/aliyun/risks", icon: <SafetyCertificateOutlined />, label: "风险提醒" },
      ],
    },
    ...(user.role === "admin" ? [{
      key: "system-management", icon: <SettingOutlined />, label: "系统管理",
      children: [{ key: "/api-keys", icon: <KeyOutlined />, label: "API Key" }],
    }] : []),
  ];

  return <Layout className="admin-shell">
    <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg" collapsedWidth={72} width={232} onBreakpoint={setCollapsed} theme="dark" className="admin-sider">
      <div className="admin-brand"><div className="brand-mark">D</div>{!collapsed && <span>Dev Buddy</span>}</div>
      <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} defaultOpenKeys={["server-operations", "database-management", "aliyun-management", "system-management"]} onClick={({ key }) => key.startsWith("/") && router.push(key)} items={menuItems} />
    </Sider>
    <Layout>
      <Header className="admin-header">
        <Button type="text" className="collapse-button" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "展开菜单" : "收起菜单"} />
        <Space size={20}>
          <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="通知" />
          <Dropdown menu={{ items: accountItems, onClick: ({ key }) => { if (key === "logout") startLogout(() => logoutAction()); } }} placement="bottomRight">
            <Flex align="center" gap={10} className="account-entry">
              <Avatar size={32} src={user.avatarUrl || undefined} style={{ backgroundColor: token.colorPrimary }}>{user.displayName.slice(0, 1)}</Avatar>
              <div className="account-copy"><Text strong>{user.displayName}</Text><Text type="secondary">@{user.username}</Text></div>
            </Flex>
          </Dropdown>
        </Space>
      </Header>
      <Content className={`admin-content${workspaceMode ? " admin-content-workbench" : ""}${sshTerminal ? " admin-content-ssh-terminal" : ""}`}><div className={`page-container${workspaceMode ? " page-container-workbench" : ""}`}>{children}</div></Content>
    </Layout>
  </Layout>;
}

export default function AdminShellClient({ children, user }: { children: ReactNode; user: AppUser }) {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677ff", borderRadius: 8, colorBgLayout: "#f5f7fa" }, components: { Layout: { headerBg: "#ffffff", siderBg: "#001529" } } }}><App><Shell user={user}>{children}</Shell></App></ConfigProvider>;
}
