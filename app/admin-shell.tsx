"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  AppstoreOutlined,
  BellOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DesktopOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  KeyOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { App, Avatar, Button, ConfigProvider, Dropdown, Flex, Layout, Menu, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import zhCN from "antd/locale/zh_CN";
import { usePathname, useRouter } from "next/navigation";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function Shell({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const databaseWorkbench = /^\/databases\/[^/]+\/workbench/.test(pathname);
  const selectedKey = ["/database-executions", "/database-policies", "/databases", "/terminal-sessions", "/servers", "/command-policies", "/executions", "/api-keys", "/aliyun/resources", "/aliyun/costs", "/aliyun/risks"].find((key) => pathname.startsWith(key))
    ?? (pathname.startsWith("/aliyun") ? "/aliyun" : "/");
  const accountItems: MenuProps["items"] = [
    { key: "profile", label: "个人资料" },
    { key: "logout", label: "退出登录", danger: true },
  ];

  return (
    <Layout className="admin-shell">
      <Sider trigger={null} collapsible collapsed={collapsed} breakpoint="lg" collapsedWidth={72} width={232} onBreakpoint={setCollapsed} theme="dark" className="admin-sider">
        <div className="admin-brand">
          <div className="brand-mark">D</div>
          {!collapsed && <span>Dev Admin</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={["server-operations", "database-management", "aliyun-management", "system-management"]}
          onClick={({ key }) => router.push(key)}
          items={[
            { key: "/", icon: <TeamOutlined />, label: "用户管理" },
            {
              key: "server-operations",
              icon: <DesktopOutlined />,
              label: "服务器运维",
              children: [
                { key: "/servers", icon: <CloudServerOutlined />, label: "服务器列表" },
                { key: "/command-policies", icon: <CodeOutlined />, label: "命令策略" },
                { key: "/executions", icon: <FileSearchOutlined />, label: "执行审计" },
                { key: "/terminal-sessions", icon: <HistoryOutlined />, label: "SSH 会话审计" },
              ],
            },
            {
              key: "database-management",
              icon: <DatabaseOutlined />,
              label: "数据库管理",
              children: [
                { key: "/databases", icon: <DatabaseOutlined />, label: "数据库列表" },
                { key: "/database-policies", icon: <CodeOutlined />, label: "SQL 执行策略" },
                { key: "/database-executions", icon: <FileSearchOutlined />, label: "SQL 执行审计" },
              ],
            },
            {
              key: "aliyun-management",
              icon: <CloudServerOutlined />,
              label: "阿里云管理",
              children: [
                { key: "/aliyun", icon: <KeyOutlined />, label: "账号管理" },
                { key: "/aliyun/resources", icon: <AppstoreOutlined />, label: "全部资源" },
                { key: "/aliyun/costs", icon: <LineChartOutlined />, label: "费用分析" },
                { key: "/aliyun/risks", icon: <SafetyCertificateOutlined />, label: "风险提醒" },
              ],
            },
            {
              key: "system-management",
              icon: <SettingOutlined />,
              label: "系统管理",
              children: [
                { key: "/api-keys", icon: <KeyOutlined />, label: "API Key" },
              ],
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <Button type="text" className="collapse-button" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "展开菜单" : "收起菜单"} />
          <Space size={20}>
            <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="通知" />
            <Dropdown menu={{ items: accountItems }} placement="bottomRight">
              <Flex align="center" gap={10} className="account-entry">
                <Avatar size={32} style={{ backgroundColor: token.colorPrimary }}>管</Avatar>
                <div className="account-copy"><Text strong>管理员</Text><Text type="secondary">admin</Text></div>
              </Flex>
            </Dropdown>
          </Space>
        </Header>
        <Content className={`admin-content${databaseWorkbench ? " admin-content-workbench" : ""}`}>
          <div className={`page-container${databaseWorkbench ? " page-container-workbench" : ""}`}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1677ff", borderRadius: 8, colorBgLayout: "#f5f7fa" }, components: { Layout: { headerBg: "#ffffff", siderBg: "#001529" } } }}>
      <App><Shell>{children}</Shell></App>
    </ConfigProvider>
  );
}
