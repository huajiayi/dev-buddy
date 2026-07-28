"use client";

import {
  CheckCircleFilled,
  CopyOutlined,
  DownloadOutlined,
  KeyOutlined,
  LinkOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Alert, App, Breadcrumb, Button, Card, Flex, Space, Steps, Tag, Typography } from "antd";
import { useRouter } from "next/navigation";
import type { AgentSetupPageData } from "./page";

const { Title, Text, Paragraph } = Typography;

function CopyBlock({ value }: { value: string }) {
  const { message } = App.useApp();
  return <div className="agent-copy-block">
    <pre>{value}</pre>
    <Button
      size="small"
      icon={<CopyOutlined />}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        message.success("已复制");
      }}
    >复制</Button>
  </div>;
}

export default function AgentSetupView({ apiKeys, versionInfo, baseUrl }: AgentSetupPageData) {
  const router = useRouter();
  const enabledKeys = apiKeys.filter((item) => item.enabled);
  const connectedKey = enabledKeys.find((item) => item.lastUsedAt);
  const envTemplate = `DEV_BUDDY_BASE_URL=${baseUrl}\nDEV_BUDDY_API_KEY=<粘贴创建时仅显示一次的个人 API Key>`;
  const versionCommand = "python <Skill目录>/scripts/dev_buddy_api.py version";
  const firstPrompt = "使用 Dev Buddy Skill 列出我有权限的服务器；精确确认一台开发或测试环境服务器，然后执行一次只读 uptime 检查并解释结果。";

  const steps = [
    {
      title: "创建个人 API Key",
      complete: enabledKeys.length > 0,
      description: "密钥绑定当前用户；Agent 的能力实时继承你的角色和资源授权。",
    },
    {
      title: "安装完整 Dev Buddy Skill",
      complete: Boolean(connectedKey),
      description: "将完整 Skill 目录安装到 Agent 支持的技能目录，具体路径以该 Agent 的文档为准。",
    },
    {
      title: "配置 Skill 本地环境",
      complete: Boolean(connectedKey),
      description: "在 Skill 目录旁的 .env 中保存地址和 API Key，不要把密钥放进命令参数或对话。",
    },
    {
      title: "完成版本与连通性检查",
      complete: Boolean(connectedKey),
      description: "运行 Skill 自带的 version 命令。服务端收到首次成功调用后会自动更新这里的状态。",
    },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "Agent 接入" }]} />
    <div className="page-heading">
      <div>
        <Title level={2}>连接支持 Skill 的 Agent</Title>
        <Text type="secondary">Dev Buddy 不绑定具体 Agent；接入要求是支持安装 Skill，并能运行 Skill 附带的客户端脚本。</Text>
      </div>
      <Tag color={connectedKey ? "success" : "processing"} icon={connectedKey ? <CheckCircleFilled /> : <RobotOutlined />}>
        {connectedKey ? "已成功连接" : "等待首次调用"}
      </Tag>
    </div>

    <Alert
      type="info"
      showIcon
      title="接入边界"
      description="Skill 只负责指导 Agent 调用 Dev Buddy API。身份、资源权限、命令策略、高风险二次确认和审计仍由 Dev Buddy 服务端执行。"
      className="agent-setup-alert"
    />

    <div className="agent-setup-grid">
      <Card title="接入进度" className="onboarding-card">
        <Steps
          direction="vertical"
          items={steps.map((step) => ({
            title: step.title,
            description: step.description,
            status: step.complete ? "finish" : "wait",
          }))}
        />
      </Card>

      <Space direction="vertical" size={16} className="full-width">
        <Card title={<Space><KeyOutlined />1. 准备个人 API Key</Space>} className="onboarding-card">
          <Paragraph>创建密钥后请立即保存；Dev Buddy 不会再次显示完整值。</Paragraph>
          <Flex gap={8} wrap>
            <Button type="primary" icon={<KeyOutlined />} onClick={() => router.push("/api-keys")}>
              {enabledKeys.length ? "管理我的 API Key" : "创建个人 API Key"}
            </Button>
            {connectedKey && <Tag color="success">{connectedKey.name} 已使用</Tag>}
          </Flex>
        </Card>

        <Card title={<Space><DownloadOutlined />2. 安装 Skill</Space>} className="onboarding-card">
          <Paragraph>
            从项目源获取 <Text code>.agents/skills/dev-buddy</Text> 完整目录，包括
            <Text code> SKILL.md</Text>、<Text code>skill-manifest.json</Text> 和 <Text code>scripts</Text>。
          </Paragraph>
          <Button href={versionInfo.skillSourceUrl} target="_blank" icon={<LinkOutlined />}>打开 Skill 源目录</Button>
        </Card>

        <Card title="3. 配置本地环境" className="onboarding-card">
          <Paragraph>在安装后的 Dev Buddy Skill 目录中创建或保留私有 <Text code>.env</Text>：</Paragraph>
          <CopyBlock value={envTemplate} />
        </Card>

        <Card title="4. 验证并完成首个任务" className="onboarding-card">
          <Text strong>版本检查</Text>
          <CopyBlock value={versionCommand} />
          <Text strong>可交给任意兼容 Agent 的首个任务</Text>
          <CopyBlock value={firstPrompt} />
          <Alert
            type={connectedKey ? "success" : "warning"}
            showIcon
            title={connectedKey ? "Agent 已成功调用 Dev Buddy" : "调用后返回此页面确认状态"}
            description={`当前服务端 ${versionInfo.serverVersion}；推荐 Skill ${versionInfo.recommendedSkillVersion}；最低兼容 ${versionInfo.minSkillVersion}。`}
          />
        </Card>
      </Space>
    </div>
  </>;
}
