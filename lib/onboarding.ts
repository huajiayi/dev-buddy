import type { UserRole } from "./auth";

export type OnboardingSignals = {
  hasSecurityBaseline: boolean;
  hasEnabledServer: boolean;
  hasAnyResource: boolean;
  hasOperator: boolean;
  hasOperatorGrant: boolean;
  hasApiKey: boolean;
  hasAgentConnection: boolean;
  hasFirstCheck: boolean;
};

export type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  complete: boolean;
  href: string;
  actionLabel: string;
};

export function buildOnboardingSteps(role: UserRole, signals: OnboardingSignals): OnboardingStep[] {
  if (role === "admin") {
    return [
      {
        key: "security",
        title: "完成安全基线",
        description: "配置系统默认密码，避免管理员逐个传递初始密码。",
        complete: signals.hasSecurityBaseline,
        href: "/system-settings",
        actionLabel: "打开系统设置",
      },
      {
        key: "server",
        title: "接入第一台服务器",
        description: "添加 SSH 连接信息并确认资源处于启用状态。",
        complete: signals.hasEnabledServer,
        href: "/servers",
        actionLabel: "管理服务器",
      },
      {
        key: "first-check",
        title: "完成首次只读检查",
        description: "对已接入服务器执行 uptime，确认权限、策略、执行和审计链路。",
        complete: signals.hasFirstCheck,
        href: "/",
        actionLabel: "开始检查",
      },
      {
        key: "operator",
        title: "创建新人并授权资源",
        description: "至少创建一位运维人员，并为其分配服务器或数据库权限。",
        complete: signals.hasOperator && signals.hasOperatorGrant,
        href: "/users",
        actionLabel: "管理用户",
      },
      {
        key: "agent",
        title: "连接支持 Skill 的 Agent",
        description: "创建个人 API Key，并让任意支持 Skill 的 Agent 成功调用一次 Dev Buddy。",
        complete: signals.hasAgentConnection,
        href: "/agent-setup",
        actionLabel: "查看接入向导",
      },
    ];
  }

  return [
    {
      key: "resource",
      title: "确认我的资源权限",
      description: "查看管理员授权给你的服务器或数据库。",
      complete: signals.hasAnyResource,
      href: "/servers",
      actionLabel: "查看资源",
    },
    {
      key: "first-check",
      title: "完成首次只读检查",
      description: "执行一次 uptime，熟悉受控命令、策略结果和审计记录。",
      complete: signals.hasFirstCheck,
      href: "/",
      actionLabel: "开始检查",
    },
    {
      key: "api-key",
      title: "创建个人 API Key",
      description: "API Key 绑定你的身份，调用权限会实时继承角色和资源授权。",
      complete: signals.hasApiKey,
      href: "/api-keys",
      actionLabel: "管理 API Key",
    },
    {
      key: "agent",
      title: "连接支持 Skill 的 Agent",
      description: "安装完整 Skill，并完成版本与连通性检查。",
      complete: signals.hasAgentConnection,
      href: "/agent-setup",
      actionLabel: "查看接入向导",
    },
  ];
}

export function onboardingProgress(steps: OnboardingStep[]) {
  const completed = steps.filter((step) => step.complete).length;
  return {
    completed,
    total: steps.length,
    percent: steps.length ? Math.round((completed / steps.length) * 100) : 0,
  };
}

export function isAdvancedOnboardingReady(signals: OnboardingSignals) {
  return signals.hasAnyResource
    && signals.hasApiKey
    && signals.hasAgentConnection
    && signals.hasFirstCheck;
}
