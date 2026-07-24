"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, App, Button, ConfigProvider, Divider, Form, Input, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { loginAction } from "./actions";

const { Title, Text } = Typography;

function LarkMark() {
  return <span className="lark-mark" aria-hidden="true"><i /><b /></span>;
}

function LoginForm({ larkEnabled, larkUrl, returnTo, initialError }: { larkEnabled: boolean; larkUrl: string; returnTo: string; initialError?: string }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form] = Form.useForm<{ account: string; password: string }>();

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand"><span className="auth-logo">D</span><div><Title level={4}>Dev Buddy</Title><Text type="secondary">基础设施管理平台</Text></div></div>
      {initialError && <Alert className="auth-error" type="error" showIcon title={initialError} />}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => startTransition(async () => {
        const result = await loginAction({ ...values, returnTo });
        if (!result.ok) { message.error(result.error); return; }
        router.replace(result.returnTo);
        router.refresh();
      })}>
        <Form.Item label="用户名" name="account" rules={[{ required: true, message: "请输入用户名" }]}>
          <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" autoFocus />
        </Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
          <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" onPressEnter={() => form.submit()} />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={pending}>登录</Button>
      </Form>
      <Divider plain>更多方式</Divider>
      <Button size="large" block disabled={!larkEnabled} icon={<LarkMark />} onClick={() => { window.location.href = larkUrl; }}>
        {larkEnabled ? "Lark 登录" : "Lark 登录未配置"}
      </Button>
    </section>
  </main>;
}

export default function LoginView(props: { larkEnabled: boolean; larkUrl: string; returnTo: string; initialError?: string }) {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#171717", borderRadius: 7 } }}><App><LoginForm {...props} /></App></ConfigProvider>;
}
