"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AuditOutlined, ClockCircleOutlined, CopyOutlined, EyeOutlined,
  RobotOutlined, StopOutlined,
} from "@ant-design/icons";
import {
  Alert, App, Breadcrumb, Button, Card, Checkbox, Descriptions, Form, Input,
  InputNumber, Modal, Popconfirm, Space, Statistic, Table, Tag, Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import type { ManagedDatabase } from "@/lib/database-management";
import type { ManagedSession, ManagedSessionEvent, ManagedSessionStatus } from "@/lib/managed-sessions";
import type { ManagedServer } from "@/lib/server-management";
import { formatDateTime } from "@/lib/date-format";
import { UiDataState, useRefreshUiData, useUiData } from "@/app/ui-data";
import {
  createManagedSessionAction,
  endManagedSessionAction,
  type ManagedSessionInput,
} from "./actions";

const { Title, Text, Paragraph } = Typography;

const statusMeta: Record<ManagedSessionStatus, { label: string; color: string }> = {
  active: { label: "托管中", color: "error" },
  ending: { label: "结束中", color: "processing" },
  completed: { label: "已完成", color: "success" },
  expired: { label: "已到期", color: "default" },
  revoked: { label: "管理员终止", color: "warning" },
  failed: { label: "异常结束", color: "error" },
};

function useCurrentTime(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function remainingText(expiresAt: string, now: number) {
  if (!now) return "正在计算";
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function SessionDetail({
  selected,
  onClose,
}: {
  selected: ManagedSession | null;
  onClose: () => void;
}) {
  const state = useUiData<{ events: ManagedSessionEvent[] }>(
    "managed-session-detail",
    selected?.id,
    Boolean(selected),
  );
  const columns: TableColumnsType<ManagedSessionEvent> = [
    { title: "#", dataIndex: "sequence", width: 60 },
    { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => formatDateTime(value) },
    { title: "资源", width: 160, render: (_, item) => item.resourceName || "-" },
    { title: "动作", dataIndex: "action", render: (value: string) => <Paragraph code ellipsis={{ rows: 3, expandable: true, symbol: "展开" }}>{value}</Paragraph> },
    { title: "状态", dataIndex: "status", width: 90, render: (value: string) => <Tag color={value === "success" ? "success" : value === "rejected" ? "warning" : "error"}>{value}</Tag> },
    { title: "结果", width: 220, render: (_, item) => <Text type="secondary">{JSON.stringify(item.resultMetadata)}</Text> },
  ];
  return <Modal
    title={`托管详情：${selected?.objective || ""}`}
    open={Boolean(selected)}
    onCancel={onClose}
    footer={null}
    width={1100}
    destroyOnHidden
  >
    {selected && <Space direction="vertical" size={16} className="full-width">
      <Descriptions column={2} items={[
        { key: "user", label: "用户", children: selected.userName },
        { key: "status", label: "状态", children: <Tag color={statusMeta[selected.status].color}>{statusMeta[selected.status].label}</Tag> },
        { key: "objective", label: "目标", children: selected.objective, span: 2 },
        { key: "reason", label: "开启原因", children: selected.reason, span: 2 },
        { key: "planned", label: "预计操作", children: selected.plannedActions || "-", span: 2 },
        { key: "time", label: "时间", children: `${formatDateTime(selected.startedAt)} → ${selected.endedAt ? formatDateTime(selected.endedAt) : formatDateTime(selected.expiresAt)}`, span: 2 },
      ]} />
      {selected.summary && <Alert type="info" showIcon title="会话总结" description={<pre className="managed-summary">{selected.summary}</pre>} />}
      <UiDataState data={state.data} error={state.error} loading={state.isLoading} retry={state.mutate}>
        {(data) => <Table rowKey="id" size="small" columns={columns} dataSource={data.events} pagination={false} scroll={{ x: 980, y: 420 }} locale={{ emptyText: "该会话尚未记录动作" }} />}
      </UiDataState>
    </Space>}
  </Modal>;
}

export default function ManagedSessionsView({
  sessions,
  servers,
  databases,
  adminMode = false,
}: {
  sessions: ManagedSession[];
  servers: ManagedServer[];
  databases: ManagedDatabase[];
  adminMode?: boolean;
}) {
  const { message } = App.useApp();
  const refresh = useRefreshUiData();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string>();
  const [selected, setSelected] = useState<ManagedSession | null>(null);
  const [form] = Form.useForm<ManagedSessionInput>();
  const active = sessions.find((item) => item.status === "active") || null;
  const now = useCurrentTime(Boolean(active));
  const rows = useMemo(() => sessions, [sessions]);

  const endSession = (session: ManagedSession) => startTransition(async () => {
    const result = await endManagedSessionAction(
      session.id,
      adminMode && session.status === "active" ? "管理员从审计页面强制结束" : "用户主动结束",
    );
    if (!result.ok) {
      message.error(result.error);
      return;
    }
    message.success("托管会话已结束并生成总结");
    refresh();
  });

  const columns: TableColumnsType<ManagedSession> = [
    ...(adminMode ? [{ title: "用户", dataIndex: "userName", width: 130 }] as TableColumnsType<ManagedSession> : []),
    { title: "目标", dataIndex: "objective", width: 240, render: (value: string, item) => <div><Text strong>{value}</Text><div><Text type="secondary">{item.reason}</Text></div></div> },
    { title: "资源", width: 250, render: (_, item) => <Space size={[4, 4]} wrap>{item.resources.map((resource) => <Tag key={`${resource.type}-${resource.id}`} color={resource.type === "server" ? "blue" : "purple"}>{resource.name} · {resource.environment}</Tag>)}</Space> },
    { title: "状态", dataIndex: "status", width: 120, render: (value: ManagedSessionStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag> },
    { title: "开始时间", dataIndex: "startedAt", width: 175, render: (value: string) => formatDateTime(value) },
    { title: "动作", dataIndex: "eventCount", width: 80 },
    { title: "操作", fixed: "right", width: 180, render: (_, item) => <Space>
      <Button type="link" icon={<EyeOutlined />} onClick={() => setSelected(item)}>详情</Button>
      {item.status === "active" && <Popconfirm
        title={adminMode ? "强制结束该托管会话？" : "立即结束托管？"}
        description="结束后令牌立即失效，并生成本次操作总结。"
        onConfirm={() => endSession(item)}
      ><Button danger type="text" icon={<StopOutlined />} loading={pending}>结束</Button></Popconfirm>}
    </Space> },
  ];

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "AI 全托管" }, ...(adminMode ? [{ title: "托管审计" }] : [])]} />
    <div className="page-heading">
      <div><Title level={2}>{adminMode ? "AI 托管审计" : "AI 全托管"} </Title><Text type="secondary">{adminMode ? "查看所有用户的临时高权限会话、动作时间线和总结" : "在限定时间和资源范围内临时允许 AI 执行高权限操作"}</Text></div>
      {!adminMode && <Button type="primary" danger icon={<RobotOutlined />} disabled={Boolean(active)} onClick={() => setOpen(true)}>开启全托管</Button>}
    </div>

    {active && !adminMode && <Alert
      type="error"
      showIcon
      title={<Space><Text strong>AI 全托管进行中</Text><Tag color="error">{remainingText(active.expiresAt, now)}</Tag></Space>}
      description={`目标：${active.objective}。托管令牌可以在 ${active.resources.length} 个授权资源上执行修改、重启、删除及数据库写入操作。`}
      action={<Popconfirm title="立即结束托管？" onConfirm={() => endSession(active)}><Button danger icon={<StopOutlined />} loading={pending}>立即结束</Button></Popconfirm>}
      className="managed-active-alert"
    />}

    <div className="stats-grid managed-stats">
      <Card><Statistic title="托管会话" value={sessions.length} prefix={<RobotOutlined />} /></Card>
      <Card><Statistic title="进行中" value={sessions.filter((item) => item.status === "active").length} prefix={<ClockCircleOutlined />} /></Card>
      <Card><Statistic title="已记录动作" value={sessions.reduce((sum, item) => sum + item.eventCount, 0)} prefix={<AuditOutlined />} /></Card>
    </div>

    <Card className="detail-card"><Table rowKey="id" columns={columns} dataSource={rows} scroll={{ x: 1180 }} pagination={{ pageSize: 10 }} locale={{ emptyText: "暂无托管记录" }} /></Card>

    <Modal
      title="开启 AI 全托管"
      open={open}
      onCancel={() => setOpen(false)}
      onOk={() => form.submit()}
      okText="确认开启"
      okButtonProps={{ danger: true }}
      confirmLoading={pending}
      width={720}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.resetFields();
        form.setFieldsValue({ durationMinutes: 30, serverIds: [], databaseIds: [] });
      }}
    >
      <Alert type="warning" showIcon title="托管期间将临时绕过普通命令与 SQL 策略" description="授权不会改变你的角色，也不能操作未授权资源、管理用户、修改权限或关闭审计。到期后令牌自动失效。" />
      <Form form={form} layout="vertical" className="managed-session-form" onFinish={(values) => startTransition(async () => {
        const result = await createManagedSessionAction(values);
        if (!result.ok) {
          message.error(result.error);
          return;
        }
        setOpen(false);
        setToken(result.token);
        message.success("AI 全托管已开启");
        refresh();
      })}>
        <Form.Item name="objective" label="托管目标" rules={[{ required: true, message: "请填写需要 AI 完成的目标" }]}><Input maxLength={500} placeholder="例如：修复生产环境 JumpServer 无法启动" /></Form.Item>
        <Form.Item name="reason" label="为什么需要全托管" rules={[{ required: true, message: "请说明普通受控模式无法完成的原因" }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        <Form.Item name="plannedActions" label="预计执行的操作"><Input.TextArea rows={3} maxLength={2000} placeholder="例如：检查日志、修改 Docker 配置并重启容器" /></Form.Item>
        <Form.Item name="durationMinutes" label="有效时间（分钟）" rules={[{ required: true }]}><InputNumber min={15} max={120} step={15} className="full-width" /></Form.Item>
        <Form.Item name="serverIds" label="授权服务器"><Checkbox.Group className="managed-resource-options" options={servers.map((item) => ({ value: item.id, label: `${item.name}（${item.environment}）` }))} /></Form.Item>
        <Form.Item name="databaseIds" label="授权数据库"><Checkbox.Group className="managed-resource-options" options={databases.map((item) => ({ value: item.id, label: `${item.name} / ${item.databaseName}（${item.environment}）` }))} /></Form.Item>
      </Form>
    </Modal>

    <Modal
      title="请立即复制托管令牌"
      open={Boolean(token)}
      onCancel={() => setToken(undefined)}
      footer={<Button type="primary" onClick={() => setToken(undefined)}>我已保存</Button>}
      closable={false}
      mask={{ closable: false }}
    >
      <Alert type="error" showIcon title="该令牌只显示一次，并拥有临时高权限" description="AI 调用时需同时携带项目 API Key 和 X-Managed-Session 请求头。结束或到期后令牌立即失效。" />
      <Paragraph copyable={{ text: token }} className="api-key-secret"><Text code>{token}</Text></Paragraph>
      <Button icon={<CopyOutlined />} onClick={async () => { if (token) await navigator.clipboard.writeText(token); message.success("已复制"); }}>复制托管令牌</Button>
    </Modal>

    <SessionDetail selected={selected} onClose={() => setSelected(null)} />
  </>;
}
