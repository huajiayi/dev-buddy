"use client";

import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  ColumnHeightOutlined,
  DatabaseOutlined,
  PlayCircleFilled,
  TableOutlined,
} from "@ant-design/icons";
import {
  App,
  Alert,
  Breadcrumb,
  Button,
  Empty,
  Input,
  InputNumber,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from "antd";
import type { DataNode } from "antd/es/tree";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { ManagedDatabase } from "@/lib/database-management";
import NoticePopover from "@/app/notice-popover";
import { executeWorkbenchSql, loadSchemaTables, loadTableColumns } from "./actions";

const { Text, Title } = Typography;

type WorkbenchResult = {
  status: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  error?: string;
  policyReason?: string;
};

type WorkbenchStyle = CSSProperties & {
  "--navigator-width": string;
  "--editor-pane-height": string;
};

function quoteIdentifier(value: string, engine: ManagedDatabase["engine"]) {
  const quote = engine === "postgresql" ? '"' : "`";
  return `${quote}${value.replaceAll(quote, quote + quote)}${quote}`;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return <Text type="secondary">NULL</Text>;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return (
    <Tooltip title={text} mouseEnterDelay={0.5}>
      <span className="database-cell-value">{text}</span>
    </Tooltip>
  );
}

function resultColumnWidth(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === "id" || normalized.endsWith("_id")) return 220;
  if (/(description|content|detail|remark|message|json|text)/.test(normalized)) return 420;
  if (/(name|title|label)/.test(normalized)) return 260;
  if (/(created|updated|deleted|date|time|timestamp)/.test(normalized)) return 190;
  if (/(status|type|count|number|sort|order)/.test(normalized)) return 130;
  return 170;
}

function treeLabel(icon: React.ReactNode, text: string) {
  return (
    <span className="database-tree-label">
      <span className="database-tree-label-icon">{icon}</span>
      <span>{text}</span>
    </span>
  );
}

function schemaKey(schema: string) {
  return `schema:${encodeURIComponent(schema)}`;
}

function tableKey(schema: string, table: string) {
  return `table:${encodeURIComponent(schema)}:${encodeURIComponent(table)}`;
}

function parseObjectKey(key: string) {
  const [type, schema = "", table = ""] = key.split(":");
  return {
    type,
    schema: decodeURIComponent(schema),
    table: decodeURIComponent(table),
  };
}

function updateTreeNode(nodes: DataNode[], key: React.Key, children: DataNode[]): DataNode[] {
  return nodes.map((node) => {
    if (node.key === key) return { ...node, children };
    if (node.children) return { ...node, children: updateTreeNode(node.children, key, children) };
    return node;
  });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function DatabaseWorkbenchView({
  database,
  schemas,
  structureError,
}: {
  database: ManagedDatabase;
  schemas: string[];
  structureError?: string;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [sql, setSql] = useState("SELECT 1 AS result;");
  const [timeoutSeconds, setTimeoutSeconds] = useState(15);
  const [result, setResult] = useState<WorkbenchResult>();
  const [requestError, setRequestError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [navigatorWidth, setNavigatorWidth] = useState(250);
  const [editorPaneHeight, setEditorPaneHeight] = useState<number>();
  const workbenchRef = useRef<HTMLDivElement>(null);
  const editorAreaRef = useRef<HTMLElement>(null);
  const horizontalResizing = useRef(false);
  const verticalResizing = useRef(false);
  const [treeData, setTreeData] = useState<DataNode[]>(() => [{
      key: `database:${database.databaseName}`,
      title: treeLabel(<DatabaseOutlined />, database.databaseName),
      children: schemas.map((schema) => ({
        key: schemaKey(schema),
        title: treeLabel(<DatabaseOutlined />, schema),
        isLeaf: false,
      })),
    }]);

  const resultColumns = useMemo(
    () => (result?.columns || []).map((name) => ({
      title: name,
      dataIndex: name,
      key: name,
      width: resultColumnWidth(name),
      ellipsis: true,
      render: displayValue,
    })),
    [result],
  );

  const execute = () => startTransition(async () => {
    setRequestError(undefined);
    const response = await executeWorkbenchSql(database.id, sql, timeoutSeconds);
    if (!response.ok) {
      setRequestError(response.error);
      return;
    }
    setResult(response.result as WorkbenchResult);
  });

  const selectObject = (keys: React.Key[]) => {
    const object = parseObjectKey(String(keys[0] || ""));
    if (object.type !== "table") return;
    const qualified = database.engine === "postgresql"
      ? `${quoteIdentifier(object.schema, database.engine)}.${quoteIdentifier(object.table, database.engine)}`
      : quoteIdentifier(object.table, database.engine);
    setSql(`SELECT *\nFROM ${qualified}\nLIMIT 100;`);
  };

  const loadTreeNode = async (node: DataNode) => {
    if (node.children) return;
    const object = parseObjectKey(String(node.key));
    if (object.type === "schema") {
      const response = await loadSchemaTables(database.id, object.schema);
      if (!response.ok) {
        message.error(response.error);
        throw new Error(response.error);
      }
      setTreeData((current) => updateTreeNode(current, node.key, response.data.map((table) => ({
        key: tableKey(table.schema, table.name),
        title: treeLabel(<TableOutlined />, table.name),
        isLeaf: false,
      }))));
      return;
    }
    if (object.type === "table") {
      const response = await loadTableColumns(database.id, object.schema, object.table);
      if (!response.ok) {
        message.error(response.error);
        throw new Error(response.error);
      }
      setTreeData((current) => updateTreeNode(current, node.key, response.data.map((column) => ({
        key: `column:${encodeURIComponent(object.schema)}:${encodeURIComponent(object.table)}:${column.position}`,
        title: treeLabel(
          <ColumnHeightOutlined />,
          `${column.name}  ${column.dataType}${column.nullable ? "" : " · NOT NULL"}`,
        ),
        isLeaf: true,
      }))));
    }
  };

  const resizeNavigator = (clientX: number) => {
    const bounds = workbenchRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const maximum = Math.max(220, Math.min(520, bounds.width - 480));
    setNavigatorWidth(Math.round(clamp(clientX - bounds.left, 220, maximum)));
  };

  const resizeEditor = (clientY: number) => {
    const bounds = editorAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const available = bounds.height - 46;
    const maximum = Math.max(160, available - 160);
    setEditorPaneHeight(Math.round(clamp(clientY - bounds.top - 40, 160, maximum)));
  };

  const adjustNavigatorByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -16 : 16;
    const width = workbenchRef.current?.getBoundingClientRect().width || 1000;
    setNavigatorWidth((current) => clamp(current + delta, 220, Math.max(220, Math.min(520, width - 480))));
  };

  const adjustEditorByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const bounds = editorAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const maximum = Math.max(160, bounds.height - 46 - 160);
    const current = editorPaneHeight ?? Math.round((bounds.height - 46) * 0.52);
    setEditorPaneHeight(clamp(current + (event.key === "ArrowUp" ? -16 : 16), 160, maximum));
  };

  const workbenchStyle: WorkbenchStyle = {
    "--navigator-width": `${navigatorWidth}px`,
    "--editor-pane-height": editorPaneHeight === undefined ? "52%" : `${editorPaneHeight}px`,
  };

  return <div className="database-workbench-page">
    <Breadcrumb items={[
      { title: "首页" },
      { title: "数据库管理" },
      { title: "数据库列表" },
      { title: "数据库工作台" },
    ]} />
    <div className="workbench-heading">
      <div>
        <Title level={3}>
          {database.name}
          <NoticePopover
            title="数据库工作台"
            description="左侧浏览数据库对象，点击表生成查询；使用 Ctrl+Enter 或 F5 执行 SQL。SQL 仍经过现有策略判断并进入执行审计。"
          />
        </Title>
        <Space size={6}>
          <Tag color={database.engine === "postgresql" ? "blue" : "orange"}>{database.engine}</Tag>
          <Text type="secondary">{database.username}@{database.host}:{database.port}</Text>
        </Space>
      </div>
      <Space wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/databases")}>返回列表</Button>
      </Space>
    </div>
    <div ref={workbenchRef} className="database-workbench" style={workbenchStyle}>
      <aside className="database-navigator">
        <div className="workbench-panel-title">
          <DatabaseOutlined />
          <Text strong>数据库导航器</Text>
        </div>
        {structureError
          ? <Alert type="error" showIcon title="结构读取失败" description={structureError} />
          : treeData[0]?.children?.length
            ? <Tree
                blockNode
                defaultExpandedKeys={[`database:${database.databaseName}`]}
                treeData={treeData}
                onSelect={selectObject}
                loadData={loadTreeNode}
              />
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前逻辑库没有可见表" />}
      </aside>
      <div
        className="workbench-splitter workbench-splitter-horizontal"
        role="separator"
        aria-label="调整数据库导航器宽度"
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={520}
        aria-valuenow={navigatorWidth}
        tabIndex={0}
        onKeyDown={adjustNavigatorByKeyboard}
        onDoubleClick={() => setNavigatorWidth(250)}
        onPointerDown={(event) => {
          horizontalResizing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeNavigator(event.clientX);
        }}
        onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
          if (horizontalResizing.current) resizeNavigator(event.clientX);
        }}
        onPointerUp={(event) => {
          horizontalResizing.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      <main ref={editorAreaRef} className="database-editor-area">
        <div className="workbench-toolbar">
          <Space>
            <Button
              type="primary"
              icon={<PlayCircleFilled />}
              loading={pending}
              disabled={!database.enabled}
              onClick={execute}
            >执行</Button>
            <Space.Compact>
              <InputNumber
                value={timeoutSeconds}
                min={1}
                max={30}
                style={{ width: 82 }}
                onChange={(value) => setTimeoutSeconds(value || 15)}
              />
              <Input value="秒" readOnly className="workbench-unit" aria-label="执行超时单位" />
            </Space.Compact>
          </Space>
          <Space size={6}><ClockCircleOutlined /><Text type="secondary">Ctrl+Enter / F5</Text></Space>
        </div>
        <Tabs
          className="database-editor-tabs"
          type="card"
          items={[{
            key: "console-1",
            label: <span><CodeOutlined /> SQL Console</span>,
            children: (
              <Input.TextArea
                value={sql}
                onChange={(event) => setSql(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey && event.key === "Enter") || event.key === "F5") {
                    event.preventDefault();
                    execute();
                  }
                }}
                spellCheck={false}
                className="database-sql-editor"
                aria-label="SQL 编辑器"
              />
            ),
          }]}
        />
        <div
          className="workbench-splitter workbench-splitter-vertical"
          role="separator"
          aria-label="调整 SQL 编辑器和结果区高度"
          aria-orientation="horizontal"
          aria-valuemin={160}
          aria-valuenow={editorPaneHeight}
          tabIndex={0}
          onKeyDown={adjustEditorByKeyboard}
          onDoubleClick={() => setEditorPaneHeight(undefined)}
          onPointerDown={(event) => {
            verticalResizing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeEditor(event.clientY);
          }}
          onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (verticalResizing.current) resizeEditor(event.clientY);
          }}
          onPointerUp={(event) => {
            verticalResizing.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        />
        <section className="database-results">
          <Tabs
            size="small"
            items={[
              {
                key: "data",
                label: `结果${result ? ` (${result.rowCount})` : ""}`,
                children: pending
                  ? <div className="workbench-result-state"><Spin description="正在执行 SQL..." /></div>
                  : requestError || result?.error
                    ? <Alert type="error" showIcon title={requestError || result?.error} />
                    : result
                      ? <div className="database-result-grid">
                          <Table
                            rowKey={(_, index) => String(index)}
                            size="small"
                            bordered
                            sticky
                            columns={resultColumns}
                            dataSource={result.rows}
                            scroll={{ x: resultColumns.reduce((total, column) => total + Number(column.width || 0), 0) }}
                            pagination={false}
                            locale={{ emptyText: "执行成功，没有返回结果行" }}
                          />
                        </div>
                      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="执行 SQL 后在这里查看结果" />,
              },
              {
                key: "messages",
                label: "执行信息",
                children: result
                  ? <Space wrap className="workbench-execution-info">
                      <Tag color={result.status === "success" ? "success" : result.status === "rejected" ? "warning" : "error"}>{result.status}</Tag>
                      <Text>{result.rowCount} 行</Text>
                      <Text>{result.durationMs} ms</Text>
                      {result.truncated && <Tag color="warning">结果已截断</Tag>}
                      {result.policyReason && <Text type="secondary">{result.policyReason}</Text>}
                    </Space>
                  : <Text type="secondary">暂无执行信息</Text>,
              },
            ]}
          />
        </section>
      </main>
    </div>
  </div>;
}
