"use client";

import { KeyOutlined } from "@ant-design/icons";
import { App, Breadcrumb, Button, Card, Form, Input, Popconfirm, Space, Tag, Typography } from "antd";
import { useTransition } from "react";
import NoticePopover from "@/app/notice-popover";
import { clearDefaultUserPasswordAction, saveDefaultUserPasswordAction } from "./actions";

const { Title, Text } = Typography;

type PasswordForm = {
  password: string;
  confirmPassword: string;
};

export default function SystemSettingsView({ hasDefaultPassword }: { hasDefaultPassword: boolean }) {
  const { message } = App.useApp();
  const [pending, startTransition] = useTransition();
  const [form] = Form.useForm<PasswordForm>();

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "系统管理" }, { title: "系统设置" }]} />
    <div className="page-heading">
      <div>
        <Title level={2}>系统设置</Title>
        <Text type="secondary">配置项目级通用设置</Text>
      </div>
    </div>

    <Card
      className="settings-card"
      title={<Space><KeyOutlined />用户默认密码<NoticePopover title="默认密码使用规则" description="创建本地用户时未填写初始密码，将自动使用这里配置的密码；手动填写的密码优先。密码只会加密保存，不会回显。" /></Space>}
      extra={<Tag color={hasDefaultPassword ? "success" : "default"}>{hasDefaultPassword ? "已配置" : "未配置"}</Tag>}
    >
      <Form<PasswordForm>
        form={form}
        layout="vertical"
        className="settings-form"
        onFinish={({ password }) => startTransition(async () => {
          const result = await saveDefaultUserPasswordAction(password);
          if (!result.ok) {
            message.error(result.error);
            return;
          }
          form.resetFields();
          message.success(hasDefaultPassword ? "默认密码已更新" : "默认密码已设置");
        })}
      >
        <Form.Item
          name="password"
          label={hasDefaultPassword ? "新默认密码" : "默认密码"}
          rules={[
            { required: true, message: "请输入默认密码" },
            { min: 8, max: 128, message: "密码需要为 8–128 个字符" },
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="请输入 8–128 个字符" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认密码"
          dependencies={["password"]}
          rules={[
            { required: true, message: "请再次输入默认密码" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return value === getFieldValue("password")
                  ? Promise.resolve()
                  : Promise.reject(new Error("两次输入的密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={pending}>
            {hasDefaultPassword ? "更新默认密码" : "保存默认密码"}
          </Button>
          {hasDefaultPassword && (
            <Popconfirm
              title="清除默认密码？"
              description="清除后，新增用户时必须手动填写初始密码。"
              okText="清除"
              cancelText="取消"
              onConfirm={() => startTransition(async () => {
                const result = await clearDefaultUserPasswordAction();
                if (!result.ok) {
                  message.error(result.error);
                  return;
                }
                form.resetFields();
                message.success("默认密码已清除");
              })}
            >
              <Button danger loading={pending}>清除默认密码</Button>
            </Popconfirm>
          )}
        </Space>
      </Form>
    </Card>
  </>;
}
