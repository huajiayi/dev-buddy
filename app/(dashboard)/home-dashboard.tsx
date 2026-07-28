"use client";

import {
  ApiOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DatabaseOutlined,
  LockOutlined,
  RocketOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Flex,
  Progress,
  Select,
  Space,
  Statistic,
  Steps,
  Tag,
  Typography,
} from "antd";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  buildOnboardingSteps,
  isAdvancedOnboardingReady,
  onboardingProgress,
} from "@/lib/onboarding";
import type { HomePageData } from "./page";
import { runFirstHealthCheck } from "./onboarding/actions";

const { Title, Text, Paragraph } = Typography;

type CheckResult = {
  executionId: string;
  status: string;
  policyDecision: string;
  policyReason: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
};

export default function HomeDashboard({
  user,
  servers,
  databases,
  apiKeys,
  recentExecutions,
  signals,
  counts,
  role,
  refresh,
}: HomePageData & { refresh: () => void }) {
  const router = useRouter();
  const { message } = App.useApp();
  const enabledServers = useMemo(() => servers.filter((server) => server.enabled), [servers]);
  const [serverId, setServerId] = useState(enabledServers[0]?.id);
  const [checkResult, setCheckResult] = useState<CheckResult>();
  const [checking, startCheck] = useTransition();
  const steps = useMemo(() => buildOnboardingSteps(role, signals), [role, signals]);
  const progress = onboardingProgress(steps);
  const advancedReady = isAdvancedOnboardingReady(signals);
  const firstIncomplete = steps.find((step) => !step.complete);
  const latestExecution = recentExecutions[0];

  function runCheck() {
    if (!serverId) return;
    startCheck(async () => {
      const response = await runFirstHealthCheck(serverId);
      if (!response.ok || !response.result) {
        message.error(response.error || "健康检查失败");
        return;
      }
      setCheckResult(response.result);
      message.success("首次只读健康检查成功");
      refresh();
    });
  }

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "工作台" }]} />

    <Card className="welcome-card">
      <Flex justify="space-between" align="center" gap={20} wrap>
        <div>
          <Space size={10} wrap>
            <Tag color={role === "admin" ? "red" : "blue"}>{role === "admin" ? "管理员" : "运维人员"}</Tag>
            <Text type="secondary">Dev Buddy 入门工作台</Text>
          </Space>
          <Title level={2}>你好，{user.displayName}</Title>
          <Paragraph>
            {progress.percent === 100
              ? "基础链路已经准备完成。你可以继续处理资源、审计执行，或在明确边界后使用高级能力。"
              : `完成 ${progress.total} 个步骤中的 ${progress.completed} 个，新人即可独立完成一次受控运维任务。`}
          </Paragraph>
        </div>
        <div className="welcome-progress">
          <Progress type="circle" percent={progress.percent} size={88} />
          {firstIncomplete && <Button type="primary" icon={<RocketOutlined />} onClick={() => router.push(firstIncomplete.href)}>
            {firstIncomplete.actionLabel}
          </Button>}
        </div>
      </Flex>
    </Card>

    <div className="stats-grid onboarding-stats">
      <Card><Statistic title="可访问服务器" value={servers.length} prefix={<CloudServerOutlined />} /></Card>
      <Card><Statistic title="可访问数据库" value={databases.length} prefix={<DatabaseOutlined />} /></Card>
      <Card><Statistic title="我的 API Key" value={apiKeys.length} prefix={<ApiOutlined />} /></Card>
      <Card><Statistic title={role === "admin" ? "系统用户" : "最近受控执行"} value={role === "admin" ? counts.users : recentExecutions.length} prefix={role === "admin" ? <TeamOutlined /> : <CodeOutlined />} /></Card>
    </div>

    <div className="onboarding-grid">
      <Card
        title={<Space><RocketOutlined />{role === "admin" ? "系统准备度" : "我的入门任务"}</Space>}
        className="onboarding-card"
      >
        <Steps
          direction="vertical"
          items={steps.map((step) => ({
            title: step.title,
            description: <div className="onboarding-step-description">
              <Text type="secondary">{step.description}</Text>
              {!step.complete && <Button type="link" onClick={() => router.push(step.href)}>{step.actionLabel}</Button>}
            </div>,
            status: step.complete ? "finish" : "wait",
          }))}
        />
      </Card>

      <Card
        title={<Space><SafetyCertificateOutlined />首次只读健康检查</Space>}
        extra={<Tag color="green">安全任务</Tag>}
        className="onboarding-card"
      >
        {enabledServers.length ? <Space direction="vertical" size={16} className="full-width">
          <Text type="secondary">
            选择一台已授权服务器执行 <Text code>uptime</Text>。每次执行都会经过命令策略并写入审计。
          </Text>
          <Select
            value={serverId}
            onChange={setServerId}
            className="full-width"
            aria-label="选择用于首次只读检查的服务器"
            options={enabledServers.map((server) => ({
              value: server.id,
              label: `${server.name}（${server.environment}）`,
            }))}
          />
          <Button type="primary" icon={<CodeOutlined />} loading={checking} onClick={runCheck}>
            执行只读检查
          </Button>
          {checkResult && <Alert
            type="success"
            showIcon
            title={`执行成功 · ${checkResult.durationMs ?? 0} ms`}
            description={<pre className="onboarding-output">{checkResult.stdout.trim() || "命令执行成功，无输出"}</pre>}
          />}
          {!checkResult && latestExecution?.source === "onboarding" && <Alert
            type="success"
            showIcon
            title="首次检查已完成"
            description={`${latestExecution.serverName || "服务器"} · ${latestExecution.durationMs ?? 0} ms`}
          />}
        </Space> : <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={role === "admin"
            ? "还没有已启用的服务器。先添加连接信息并测试连接。"
            : "你还没有可执行检查的服务器权限，请让管理员为你授权。"}
        >
          <Button type="primary" onClick={() => role === "admin" ? router.push("/servers") : refresh()}>
            {role === "admin" ? "添加服务器" : "刷新资源权限"}
          </Button>
        </Empty>}
      </Card>
    </div>

    <div className="onboarding-grid onboarding-grid-secondary">
      <Card title={<Space><RobotOutlined />支持 Skill 的 Agent</Space>} className="onboarding-card">
        <Space direction="vertical" size={12} className="full-width">
          <Text type="secondary">Dev Buddy 不绑定具体 Agent。只要 Agent 支持安装 Skill 并能运行其客户端脚本，就可以接入。</Text>
          <Flex gap={8} wrap>
            <Tag color={signals.hasApiKey ? "success" : "default"}>{signals.hasApiKey ? "API Key 已创建" : "待创建 API Key"}</Tag>
            <Tag color={signals.hasAgentConnection ? "success" : "processing"}>{signals.hasAgentConnection ? "已成功调用" : "等待首次调用"}</Tag>
          </Flex>
          <Button icon={<RobotOutlined />} onClick={() => router.push("/agent-setup")}>打开通用接入向导</Button>
        </Space>
      </Card>

      <Card title={<Space><LockOutlined />高级能力</Space>} className="onboarding-card">
        {advancedReady ? <Alert
          type="success"
          showIcon
          title="基础链路已验证"
          description="现在可以在明确目标、资源范围和时限后使用 AI 全托管；所有动作仍会被审计。"
          action={<Button onClick={() => router.push("/managed-sessions")}>了解高级能力</Button>}
        /> : <Alert
          type="info"
          showIcon
          title="完成基础任务后开放引导"
          description="先完成资源授权、首次只读检查、个人 API Key 和 Agent 连通性检查。"
          action={<Button onClick={() => router.push(firstIncomplete?.href || "/agent-setup")}>继续入门</Button>}
        />}
      </Card>
    </div>
  </>;
}
