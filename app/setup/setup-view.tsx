"use client";

import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, ConfigProvider, Form, Input, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { initializeAction } from "../login/actions";

const { Title, Text } = Typography;

function SetupForm() {
  const { message } = App.useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form] = Form.useForm<{ username: string; displayName: string; email?: string; password: string; confirmPassword: string }>();
  return <main className="auth-page">
    <section className="auth-card auth-card-setup">
      <div className="auth-brand"><span className="auth-logo">D</span><div><Title level={4}>初始化 Dev Buddy</Title><Text type="secondary">创建第一个系统管理员</Text></div></div>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={(values) => startTransition(async () => {
        const result = await initializeAction(values);
        if (!result.ok) { message.error(result.error); return; }
        message.success("管理员创建成功");
        router.replace("/");
        router.refresh();
      })}>
        <Form.Item label="管理员姓名" name="displayName" rules={[{ required: true, message: "请输入管理员姓名" }]}><Input size="large" prefix={<UserOutlined />} /></Form.Item>
        <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }, { pattern: /^[A-Za-z0-9._-]{3,64}$/, message: "请输入 3–64 位有效用户名" }]}><Input size="large" prefix={<UserOutlined />} autoComplete="username" /></Form.Item>
        <Form.Item label="邮箱（可选）" name="email" rules={[{ type: "email", message: "请输入有效邮箱" }]}><Input size="large" prefix={<MailOutlined />} autoComplete="email" /></Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, min: 8, message: "密码至少需要 8 个字符" }]}><Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>
        <Form.Item label="确认密码" name="confirmPassword" dependencies={["password"]} rules={[{ required: true, message: "请再次输入密码" }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")); } })]}><Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={pending}>创建管理员并进入系统</Button>
      </Form>
    </section>
  </main>;
}

export default function SetupView() {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#171717", borderRadius: 7 } }}><App><SetupForm /></App></ConfigProvider>;
}
