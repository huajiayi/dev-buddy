"use client";

import { createContext, type ReactNode, useContext, useEffect, useState, useTransition } from "react";
import {
  AppstoreOutlined, AuditOutlined, CloudServerOutlined, CodeOutlined, DatabaseOutlined,
  DesktopOutlined, FileSearchOutlined, HistoryOutlined, KeyOutlined, LineChartOutlined,
  HomeOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SafetyCertificateOutlined,
  RobotOutlined, RocketOutlined, SettingOutlined, TeamOutlined, WarningOutlined,
} from "@ant-design/icons";
import { App, Avatar, Button, ConfigProvider, Dropdown, Flex, Layout, Menu, Result, Skeleton, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import zhCN from "antd/locale/zh_CN";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AppUser, UserRole } from "@/lib/auth";
import { logoutAction } from "./login/actions";
import useSWR from "swr";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const roleLabels: Record<UserRole, string> = { admin: "管理员", operator: "运维人员" };
const SessionContext = createContext<AppUser | null>(null);

async function loadSession(url: string) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json() as { data?: AppUser; message?: string };
  if (!response.ok || !payload.data) {
    const error = new Error(payload.message || "登录状态读取失败") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function useCurrentUser() {
  return useContext(SessionContext);
}

function Shell({ children, user }: { children: ReactNode; user: AppUser }) {
  const { token } = theme.useToken();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, startLogout] = useTransition();
  const databaseWorkbench = pathname === "/database-workbench";
  const controlledTerminal = pathname === "/server-terminal";
  const sshTerminal = pathname === "/ssh-terminal";
  const workspaceMode = databaseWorkbench || sshTerminal;
  const selectedKey = databaseWorkbench
    ? "/databases"
    : controlledTerminal || sshTerminal
      ? "/servers"
      : ["/agent-setup", "/users", "/managed-session-audit", "/managed-sessions", "/database-executions", "/database-policies", "/databases", "/terminal-sessions", "/servers", "/command-policies", "/executions", "/system-settings", "/api-keys", "/aliyun/resources", "/aliyun/costs", "/aliyun/risks"].find((key) => pathname.startsWith(key))
        ?? (pathname.startsWith("/aliyun") ? "/aliyun" : "/");
  const accountItems: MenuProps["items"] = [
    { key: "identity", label: <div className="account-menu-identity"><Text strong>{user.displayName}</Text><Text type="secondary">{roleLabels[user.role]}</Text></div>, disabled: true },
    { type: "divider" },
    { key: "logout", label: loggingOut ? "正在退出…" : "退出登录", icon: <LogoutOutlined />, danger: true },
  ];
  const menuLink = (href: string, label: string) => <Link href={href}>{label}</Link>;

  const menuItems: MenuProps["items"] = [
    {
      key: "/",
      icon: <HomeOutlined />,
      label: menuLink("/", "工作台"),
    },
    {
      key: "server-operations", icon: <DesktopOutlined />, label: "服务器运维",
      children: [
        { key: "/servers", icon: <CloudServerOutlined />, label: menuLink("/servers", "服务器列表") },
        ...(user.role === "admin" ? [
          { key: "/command-policies", icon: <CodeOutlined />, label: menuLink("/command-policies", "命令策略") },
          { key: "/executions", icon: <FileSearchOutlined />, label: menuLink("/executions", "执行审计") },
          { key: "/terminal-sessions", icon: <HistoryOutlined />, label: menuLink("/terminal-sessions", "SSH 会话审计") },
        ] : []),
      ],
    },
    {
      key: "database-management", icon: <DatabaseOutlined />, label: "数据库管理",
      children: [
        { key: "/databases", icon: <DatabaseOutlined />, label: menuLink("/databases", "数据库列表") },
        ...(user.role === "admin" ? [
          { key: "/database-policies", icon: <CodeOutlined />, label: menuLink("/database-policies", "SQL 执行策略") },
          { key: "/database-executions", icon: <FileSearchOutlined />, label: menuLink("/database-executions", "SQL 执行审计") },
        ] : []),
      ],
    },
    {
      key: "/agent-setup",
      icon: <RobotOutlined />,
      label: menuLink("/agent-setup", "Agent 接入"),
    },
    ...(user.role === "admin" ? [{
      key: "aliyun-management", icon: <CloudServerOutlined />, label: "阿里云管理",
      children: [
        { key: "/aliyun", icon: <KeyOutlined />, label: menuLink("/aliyun", "账号管理") },
        { key: "/aliyun/resources", icon: <AppstoreOutlined />, label: menuLink("/aliyun/resources", "全部资源") },
        { key: "/aliyun/costs", icon: <LineChartOutlined />, label: menuLink("/aliyun/costs", "费用分析") },
        { key: "/aliyun/risks", icon: <SafetyCertificateOutlined />, label: menuLink("/aliyun/risks", "风险提醒") },
      ],
    }] : []),
    {
      key: "advanced-capabilities", icon: <WarningOutlined />, label: "高级能力",
      children: [
        { key: "/managed-sessions", icon: <RobotOutlined />, label: menuLink("/managed-sessions", "AI 全托管") },
        ...(user.role === "admin" ? [
          { key: "/managed-session-audit", icon: <AuditOutlined />, label: menuLink("/managed-session-audit", "托管审计") },
        ] : []),
      ],
    },
    {
      key: "system-management", icon: <SettingOutlined />, label: "系统管理",
      children: [
        ...(user.role === "admin" ? [{ key: "/users", icon: <TeamOutlined />, label: menuLink("/users", "用户管理") }] : []),
        ...(user.role === "admin" ? [{ key: "/system-settings", icon: <SettingOutlined />, label: menuLink("/system-settings", "系统设置") }] : []),
        { key: "/api-keys", icon: <KeyOutlined />, label: menuLink("/api-keys", "API Key") },
      ],
    },
  ];

  return <Layout className="admin-shell">
    <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg" collapsedWidth={72} width={232} onBreakpoint={setCollapsed} theme="dark" className="admin-sider">
      <div className="admin-brand"><div className="brand-mark">D</div>{!collapsed && <span>Dev Buddy</span>}</div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        defaultOpenKeys={["server-operations", "database-management", "aliyun-management", "system-management"]}
        onClick={({ key, domEvent }) => {
          if (key.startsWith("/") && !(domEvent.target as HTMLElement).closest("a")) router.push(key);
        }}
        items={menuItems}
      />
    </Sider>
    <Layout>
      <Header className="admin-header">
        <Button type="text" className="collapse-button" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "展开菜单" : "收起菜单"} />
        <Space size={20}>
          <Button type="text" shape="circle" icon={<RocketOutlined />} aria-label="打开入门任务" title="入门任务" onClick={() => router.push("/")} />
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

export default function AdminShellClient({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: user, error, isLoading } = useSWR<AppUser>("/api/ui/session", loadSession, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if ((error as Error & { status?: number } | undefined)?.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [error, router]);

  let content: ReactNode;
  if (isLoading || (!user && !error)) {
    content = <div className="shell-loading-state"><Skeleton active paragraph={{ rows: 8 }} /></div>;
  } else if (error || !user) {
    content = <Result status="error" title="登录状态读取失败" subTitle={error?.message} />;
  } else {
    content = <SessionContext.Provider value={user}><Shell user={user}>{children}</Shell></SessionContext.Provider>;
  }

  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677ff", borderRadius: 8, colorBgLayout: "#f5f7fa" }, components: { Layout: { headerBg: "#ffffff", siderBg: "#001529" } } }}><App>{content}</App></ConfigProvider>;
}
