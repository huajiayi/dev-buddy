"use client";

import {
  ArrowLeftOutlined,
  ClearOutlined,
  DisconnectOutlined,
  FileSearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Breadcrumb, Button, Card, Space, Tag, Typography } from "antd";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ManagedServer } from "@/lib/server-management";
import NoticePopover from "@/app/notice-popover";
import { issueSshTerminalTicket } from "./actions";

const { Title, Text } = Typography;
type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export default function SshTerminalView({ server }: { server: ManagedServer }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm>(null);
  const websocketRef = useRef<WebSocket>(null);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    if (!containerRef.current) return;
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: '"Geist Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.3,
      scrollback: 5000,
      theme: {
        background: "#07101d",
        foreground: "#d7e0ea",
        cursor: "#69b1ff",
        selectionBackground: "#264f78",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    terminal.writeln("\x1b[1;34mDev Buddy SSH 交互终端\x1b[0m");
    terminal.writeln("正在创建安全连接...");
    setStatus("connecting");

    let websocket: WebSocket | undefined;
    let ready = false;
    let disposed = false;
    const sendResize = () => {
      fit.fit();
      if (ready && websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }));
      }
    };
    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(containerRef.current);
    const inputSubscription = terminal.onData((data) => {
      if (ready && websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: "input", data }));
      }
    });

    void issueSshTerminalTicket(server.id).then((result) => {
      if (disposed) return;
      if (!result.ok) {
        setStatus("error");
        terminal.writeln(`\r\n\x1b[31m${result.error}\x1b[0m`);
        return;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      websocket = new WebSocket(
        `${protocol}//${window.location.host}/ws/ssh-terminal?ticket=${encodeURIComponent(result.ticket)}`,
      );
      websocket.binaryType = "arraybuffer";
      websocketRef.current = websocket;
      websocket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          terminal.write(new Uint8Array(event.data));
          return;
        }
        try {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            status?: string;
            message?: string;
          };
          if (message.type === "status" && message.status === "ready") {
            ready = true;
            setStatus("connected");
            terminal.writeln("\r\n\x1b[32mSSH 已连接\x1b[0m");
            sendResize();
            terminal.focus();
          } else if (message.type === "error") {
            setStatus("error");
            terminal.writeln(`\r\n\x1b[31m${message.message || "SSH 连接失败"}\x1b[0m`);
          }
        } catch {
          terminal.writeln("\r\n\x1b[31m收到无法识别的终端消息\x1b[0m");
        }
      };
      websocket.onerror = () => {
        setStatus("error");
        terminal.writeln("\r\n\x1b[31mWebSocket 连接失败\x1b[0m");
      };
      websocket.onclose = (event) => {
        ready = false;
        setStatus((current) => current === "error" ? current : "disconnected");
        terminal.writeln(
          `\r\n\x1b[33m连接已断开${event.reason ? `：${event.reason}` : ""}\x1b[0m`,
        );
      };
    });

    sendResize();
    return () => {
      disposed = true;
      inputSubscription.dispose();
      resizeObserver.disconnect();
      websocket?.close(1000, "离开终端页面");
      websocketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [connectionVersion, server.id]);

  const statusMeta: Record<ConnectionStatus, { color: string; text: string }> = {
    connecting: { color: "processing", text: "连接中" },
    connected: { color: "success", text: "已连接" },
    disconnected: { color: "default", text: "已断开" },
    error: { color: "error", text: "连接失败" },
  };

  return <>
    <Breadcrumb items={[
      { title: "首页" },
      { title: "服务器运维" },
      { title: "服务器列表" },
      { title: "SSH 终端" },
    ]} />
    <div className="page-heading">
      <div>
        <Title level={2}>
          {server.name} · SSH 终端
          <NoticePopover
            title="完整 SSH 交互会话"
            description="该入口与 Xshell 类似，会保持工作目录和进程状态，并支持交互式程序。命令正则策略不适用于完整 PTY；你的所有输入都会直接作用于服务器。系统仅审计会话元数据，不记录终端内容。"
          />
        </Title>
        <Space>
          <Text code>{server.username}@{server.host}:{server.port}</Text>
          <Tag color={statusMeta[status].color}>{statusMeta[status].text}</Tag>
        </Space>
      </div>
      <Space wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/servers")}>返回</Button>
        <Button icon={<FileSearchOutlined />} onClick={() => router.push("/terminal-sessions")}>会话审计</Button>
        <Button
          icon={<DisconnectOutlined />}
          disabled={status !== "connected" && status !== "connecting"}
          onClick={() => websocketRef.current?.close(1000, "用户主动断开")}
        >断开</Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => setConnectionVersion((value) => value + 1)}
        >重新连接</Button>
        <Button
          icon={<ClearOutlined />}
          onClick={() => {
            terminalRef.current?.clear();
            terminalRef.current?.focus();
          }}
        >清屏</Button>
      </Space>
    </div>
    <Card className="terminal-card" styles={{ body: { padding: 0 } }}>
      <div ref={containerRef} className="server-terminal ssh-interactive-terminal" />
    </Card>
  </>;
}
