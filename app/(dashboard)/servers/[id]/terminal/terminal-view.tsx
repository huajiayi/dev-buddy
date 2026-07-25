"use client";

import { ArrowLeftOutlined, ClearOutlined, FileSearchOutlined } from "@ant-design/icons";
import { Breadcrumb, Button, Card, Space, Tag, Typography } from "antd";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ManagedServer } from "@/lib/server-management";
import NoticePopover from "@/app/notice-popover";
import { executeTerminalCommand } from "./actions";

const { Title, Text } = Typography;

function safeOutput(value: string) {
  return value
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    .replace(/\x1B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u0080-\uFFFF]/g, "");
}

export default function ServerTerminalView({ server }: { server: ManagedServer }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const terminal = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"Geist Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.35,
      scrollback: 3000,
      theme: { background: "#0b1220", foreground: "#d7e0ea", cursor: "#69b1ff", selectionBackground: "#264f78" },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;

    const prompt = `${server.username}@${server.host}$ `;
    const history: string[] = [];
    let historyIndex = 0;
    let line = "";
    const redraw = () => {
      terminal.write(`\x1b[2K\r${prompt}${line}`);
    };
    const showPrompt = () => terminal.write(`\r\n${prompt}`);
    const run = async () => {
      const command = line.trim();
      line = "";
      terminal.write("\r\n");
      if (!command) { terminal.write(prompt); return; }
      history.push(command);
      historyIndex = history.length;
      busyRef.current = true;
      setBusy(true);
      terminal.write("\x1b[90m正在执行并检查命令策略...\x1b[0m\r\n");
      const response = await executeTerminalCommand(server.id, command);
      if (!response.ok) {
        terminal.write(`\x1b[31m${safeOutput(response.error)}\x1b[0m`);
      } else {
        const result = response.result;
        if (result.stdout) terminal.write(safeOutput(result.stdout));
        if (result.stderr) terminal.write(`\x1b[31m${safeOutput(result.stderr)}\x1b[0m`);
        if (result.status === "rejected") {
          terminal.write(`\x1b[33m策略拒绝：${safeOutput(result.policyReason)}\x1b[0m`);
        }
        terminal.write(`\r\n\x1b[90m[${result.status} · exit ${result.exitCode ?? "-"} · ${result.durationMs ?? 0} ms]\x1b[0m`);
      }
      busyRef.current = false;
      setBusy(false);
      showPrompt();
    };
    const subscription = terminal.onData((data) => {
      if (busyRef.current || !server.enabled) return;
      if (data === "\u001b[A") {
        if (history.length) {
          historyIndex = Math.max(0, historyIndex - 1);
          line = history[historyIndex];
          redraw();
        }
        return;
      }
      if (data === "\u001b[B") {
        historyIndex = Math.min(history.length, historyIndex + 1);
        line = history[historyIndex] || "";
        redraw();
        return;
      }
      for (const character of data) {
        if (character === "\r" || character === "\n") { void run(); continue; }
        if (character === "\u007f") {
          if (line.length) { line = line.slice(0, -1); terminal.write("\b \b"); }
          continue;
        }
        if (character === "\u0003") { line = ""; terminal.write("^C"); showPrompt(); continue; }
        if (character === "\u000c") { terminal.clear(); redraw(); continue; }
        if (character === "\u001b") continue;
        if (character >= " ") { line += character; terminal.write(character); }
      }
    });
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(containerRef.current);
    fit.fit();
    terminal.writeln("\x1b[1;34mDev Buddy 受控终端\x1b[0m");
    terminal.writeln("每条命令独立执行，并经过命令策略、超时和审计。");
    if (!server.enabled) terminal.writeln("\x1b[31m服务器当前已禁用，无法执行命令。\x1b[0m");
    terminal.write(`\r\n${prompt}`);
    terminal.focus();
    return () => { subscription.dispose(); resize.disconnect(); terminal.dispose(); terminalRef.current = null; };
  }, [server]);

  return <>
    <Breadcrumb items={[{ title: "首页" }, { title: "服务器运维" }, { title: "服务器列表" }, { title: "受控终端" }]} />
    <div className="page-heading">
      <div><Title level={2}>{server.name} · 受控终端<NoticePopover title="策略控制的命令终端" description="每次回车提交一条独立命令并按自定义策略判断；未命中策略时默认允许。终端不保持工作目录，也不支持持续交互式程序。" /></Title><Space><Text code>{server.username}@{server.host}:{server.port}</Text><Tag color={server.enabled ? "success" : "default"}>{server.enabled ? "已启用" : "已禁用"}</Tag>{busy && <Tag color="processing">执行中</Tag>}</Space></div>
      <Space><Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/servers")}>返回</Button><Button icon={<FileSearchOutlined />} onClick={() => router.push("/executions")}>执行审计</Button><Button icon={<ClearOutlined />} onClick={() => { terminalRef.current?.clear(); terminalRef.current?.focus(); }}>清屏</Button></Space>
    </div>
    <Card className="terminal-card" styles={{ body: { padding: 0 } }}><div ref={containerRef} className="server-terminal" /></Card>
  </>;
}
