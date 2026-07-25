import { createServer } from "node:http";
import {
  createDecipheriv,
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import next from "next";
import mysql from "mysql2";
import pg from "pg";
import ssh2 from "ssh2";
import { WebSocket, WebSocketServer } from "ws";

const { Pool } = pg;
const { Client: SshClient } = ssh2;
const dev = process.argv.includes("--dev");
const portArgument = process.argv.find((value) => /^\d+$/.test(value));
const port = Number(portArgument || process.env.PORT || 3000);
const hostname = process.env.DEV_BUDDY_HOST || "0.0.0.0";
const app = next({ dev, hostname, port });
await app.prepare();

const handle = app.getRequestHandler();
const handleNextUpgrade = app.getUpgradeHandler();
const server = createServer((request, response) => handle(request, response));
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const consumedTickets = new Map();
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRESQL_HOST,
      port: Number(process.env.POSTGRESQL_PORT),
      user: process.env.POSTGRESQL_USERNAME,
      password: process.env.POSTGRESQL_PASSWORD,
      database: process.env.POSTGRESQL_DATABASE,
      ssl: process.env.POSTGRESQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

function getTicketSecret() {
  const secret =
    process.env.TERMINAL_TICKET_SECRET ||
    process.env.ALIYUN_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.POSTGRESQL_PASSWORD;
  if (!secret) throw new Error("缺少终端票据签名密钥");
  return secret;
}

function getEncryptionSecret() {
  const secret =
    process.env.ALIYUN_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.POSTGRESQL_PASSWORD;
  if (!secret) throw new Error("缺少项目凭据加密密钥");
  return secret;
}

function decryptSecret(value) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("服务器凭据格式无效");
  const key = createHash("sha256").update(getEncryptionSecret()).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function verifyTicket(ticket) {
  const [payloadPart, signaturePart] = ticket.split(".");
  if (!payloadPart || !signaturePart) throw new Error("终端票据无效");
  const expected = createHmac("sha256", getTicketSecret()).update(payloadPart).digest();
  const supplied = Buffer.from(signaturePart, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("终端票据签名无效");
  }
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  if (
    payload.kind !== "ssh" ||
    typeof payload.targetId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payload.targetId) ||
    typeof payload.actorUserId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payload.actorUserId) ||
    typeof payload.exp !== "number" ||
    typeof payload.nonce !== "string"
  ) {
    throw new Error("终端票据内容无效");
  }
  if (payload.exp < Date.now()) throw new Error("终端票据已过期，请重新连接");
  if (consumedTickets.has(payload.nonce)) throw new Error("终端票据已被使用");
  consumedTickets.set(payload.nonce, payload.exp);
  return payload;
}

function rejectUpgrade(socket, status, message) {
  const body = Buffer.from(message);
  socket.write(
    `HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
  );
  socket.write(body);
  socket.destroy();
}

function originIsAllowed(request) {
  const origin = request.headers.origin;
  const expectedHost = request.headers["x-forwarded-host"] || request.headers.host;
  if (!origin || !expectedHost) return true;
  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/ws/ssh-terminal") {
    void handleNextUpgrade(request, socket, head);
    return;
  }
  if (!originIsAllowed(request)) {
    rejectUpgrade(socket, "403 Forbidden", "Origin 不匹配");
    return;
  }
  try {
    const ticket = verifyTicket(url.searchParams.get("ticket") || "");
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request, ticket);
    });
  } catch (error) {
    rejectUpgrade(
      socket,
      "401 Unauthorized",
      error instanceof Error ? error.message : "终端票据无效",
    );
  }
});

websocketServer.on("connection", async (websocket, request, ticket) => {
  if (ticket.kind !== "ssh") return;
  const sessionId = randomUUID();
  const remoteAddress =
    String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    request.socket.remoteAddress ||
    null;
  let sshClient;
  let sshStream;
  let serverRow;
  let bytesIn = 0;
  let bytesOut = 0;
  let finished = false;
  let connected = false;
  let idleTimer;
  let maximumTimer;

  const sendJson = (value) => {
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify(value));
    }
  };
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => finish("closed", "空闲超过 30 分钟"), 30 * 60 * 1000);
  };
  const finish = async (status, reason) => {
    if (finished) return;
    finished = true;
    clearTimeout(idleTimer);
    clearTimeout(maximumTimer);
    if (sshStream) sshStream.destroy();
    if (sshClient) sshClient.end();
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.close(status === "failed" ? 1011 : 1000, reason.slice(0, 120));
    }
    if (serverRow) {
      await getPool().query(
        `UPDATE ssh_terminal_sessions
         SET status=$2, bytes_in=$3, bytes_out=$4, close_reason=$5, ended_at=NOW()
         WHERE id=$1`,
        [sessionId, status, bytesIn, bytesOut, reason.slice(0, 1000)],
      ).catch((error) => console.error("更新 SSH 会话审计失败", error));
    }
  };

  try {
    const result = await getPool().query(
      `SELECT s.id,s.name,s.host,s.port,s.username,s.auth_type,s.credential_encrypted
       FROM managed_servers s
       JOIN app_users u ON u.id=$2 AND u.enabled=TRUE
       LEFT JOIN user_server_grants g ON g.user_id=u.id AND g.server_id=s.id
       WHERE s.id=$1 AND s.enabled=TRUE
         AND (u.role='admin' OR g.server_id IS NOT NULL)`,
      [ticket.targetId, ticket.actorUserId],
    );
    serverRow = result.rows[0];
    if (!serverRow) throw new Error("服务器不存在或已禁用");
    await getPool().query(
      `INSERT INTO ssh_terminal_sessions
       (id, server_id, actor_user_id, server_name, status, remote_address)
       VALUES ($1,$2,$3,$4,'connecting',$5)`,
      [sessionId, serverRow.id, ticket.actorUserId, serverRow.name, remoteAddress],
    );

    const credential = JSON.parse(decryptSecret(serverRow.credential_encrypted));
    sendJson({ type: "status", status: "connecting", sessionId });
    sshClient = new SshClient();
    maximumTimer = setTimeout(() => finish("closed", "会话达到 8 小时上限"), 8 * 60 * 60 * 1000);
    resetIdleTimer();

    sshClient.on("ready", () => {
      sshClient.shell(
        { term: "xterm-256color", cols: 120, rows: 32 },
        async (error, stream) => {
          if (error) {
            sendJson({ type: "error", message: error.message });
            await finish("failed", error.message);
            return;
          }
          sshStream = stream;
          connected = true;
          await getPool().query(
            "UPDATE ssh_terminal_sessions SET status='connected', connected_at=NOW() WHERE id=$1",
            [sessionId],
          );
          sendJson({ type: "status", status: "ready", sessionId });
          stream.on("data", (data) => {
            bytesOut += data.length;
            resetIdleTimer();
            if (websocket.readyState === WebSocket.OPEN) {
              websocket.send(data, { binary: true });
            }
          });
          stream.on("close", () => finish("closed", "远程终端已关闭"));
          stream.on("error", (streamError) => {
            sendJson({ type: "error", message: streamError.message });
            void finish("failed", streamError.message);
          });
        },
      );
    });
    sshClient.on("error", (error) => {
      sendJson({ type: "error", message: error.message });
      void finish("failed", error.message);
    });
    sshClient.on("close", () => {
      if (!finished) void finish(connected ? "closed" : "failed", "SSH 连接已关闭");
    });
    sshClient.connect({
      host: serverRow.host,
      port: serverRow.port,
      username: serverRow.username,
      readyTimeout: 15_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      ...(serverRow.auth_type === "password"
        ? { password: credential.secret }
        : { privateKey: credential.secret }),
    });

    websocket.on("message", (raw, isBinary) => {
      if (isBinary || !sshStream) return;
      try {
        const message = JSON.parse(raw.toString("utf8"));
        if (message.type === "input" && typeof message.data === "string") {
          bytesIn += Buffer.byteLength(message.data);
          resetIdleTimer();
          sshStream.write(message.data);
        } else if (
          message.type === "resize" &&
          Number.isInteger(message.cols) &&
          Number.isInteger(message.rows)
        ) {
          sshStream.setWindow(
            Math.max(2, Math.min(message.rows, 500)),
            Math.max(2, Math.min(message.cols, 500)),
            0,
            0,
          );
        }
      } catch {
        sendJson({ type: "error", message: "终端消息格式无效" });
      }
    });
    websocket.on("close", () => finish("closed", "浏览器已断开"));
    websocket.on("error", (error) => finish("failed", error.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : "SSH 终端连接失败";
    sendJson({ type: "error", message });
    await finish("failed", message);
  }
});

function databaseSslOptions(row, credential) {
  if (row.tls_mode === "disable") return undefined;
  if (row.tls_mode === "require") return { rejectUnauthorized: false };
  return {
    rejectUnauthorized: true,
    ca: credential.tlsCa || undefined,
    servername: row.host,
  };
}

async function openDatabaseTunnel(row) {
  if (row.connection_mode === "direct") {
    return { stream: undefined, close: () => undefined };
  }
  const result = await getPool().query(
    `SELECT host,port,username,auth_type,credential_encrypted
     FROM managed_servers WHERE id=$1 AND enabled=TRUE`,
    [row.ssh_server_id],
  );
  const serverRow = result.rows[0];
  if (!serverRow) throw new Error("SSH 隧道服务器不存在或已禁用");
  const credential = JSON.parse(decryptSecret(serverRow.credential_encrypted));
  return new Promise((resolve, reject) => {
    const client = new SshClient();
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      client.end();
      reject(error);
    };
    client.once("error", fail);
    client.once("ready", () => {
      client.forwardOut("127.0.0.1", 0, row.host, row.port, (error, stream) => {
        if (error) return fail(error);
        settled = true;
        client.removeListener("error", fail);
        client.on("error", () => undefined);
        resolve({
          stream,
          close: () => {
            stream.destroy();
            client.end();
          },
        });
      });
    });
    client.connect({
      host: serverRow.host,
      port: serverRow.port,
      username: serverRow.username,
      readyTimeout: 15_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      ...(serverRow.auth_type === "password"
        ? { password: credential.secret }
        : { privateKey: credential.secret }),
    });
  });
}

function normalizeDatabaseValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `<binary ${value.length} bytes>`;
  if (Array.isArray(value)) return value.map(normalizeDatabaseValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeDatabaseValue(item)]),
    );
  }
  return value;
}

function limitDatabaseRows(rows) {
  const output = [];
  let bytes = 2;
  let truncated = false;
  for (const rawRow of rows || []) {
    const row = normalizeDatabaseValue(rawRow);
    const size = Buffer.byteLength(JSON.stringify(row), "utf8");
    if (output.length >= 1000 || bytes + size > 1024 * 1024) {
      truncated = true;
      break;
    }
    output.push(row);
    bytes += size;
  }
  return { rows: output, bytes, truncated };
}

websocketServer.on("connection", async (websocket, request, ticket) => {
  if (ticket.kind !== "database") return;
  const sessionId = randomUUID();
  const remoteAddress =
    String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    request.socket.remoteAddress ||
    null;
  let databaseRow;
  let tunnel;
  let pgClient;
  let mysqlConnection;
  let queryCount = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  let finished = false;
  let busy = false;
  let idleTimer;
  let maximumTimer;

  const sendJson = (value) => {
    if (websocket.readyState !== WebSocket.OPEN) return;
    const data = JSON.stringify(value);
    bytesOut += Buffer.byteLength(data);
    websocket.send(data);
  };
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => finish("closed", "空闲超过 30 分钟"),
      30 * 60 * 1000,
    );
  };
  const finish = async (status, reason) => {
    if (finished) return;
    finished = true;
    clearTimeout(idleTimer);
    clearTimeout(maximumTimer);
    if (pgClient) await pgClient.end().catch(() => undefined);
    if (mysqlConnection) mysqlConnection.destroy();
    if (tunnel) tunnel.close();
    if (websocket.readyState === WebSocket.OPEN) {
      websocket.close(status === "failed" ? 1011 : 1000, reason.slice(0, 120));
    }
    if (databaseRow) {
      await getPool().query(
        `UPDATE database_terminal_sessions
         SET status=$2,query_count=$3,bytes_in=$4,bytes_out=$5,close_reason=$6,ended_at=NOW()
         WHERE id=$1`,
        [sessionId, status, queryCount, bytesIn, bytesOut, reason.slice(0, 1000)],
      ).catch((error) => console.error("更新数据库终端审计失败", error));
    }
  };

  try {
    const result = await getPool().query(
      `SELECT id,name,engine,host,port,database_name,username,credential_encrypted,
              connection_mode,ssh_server_id,tls_mode
       FROM managed_databases WHERE id=$1 AND enabled=TRUE`,
      [ticket.targetId],
    );
    databaseRow = result.rows[0];
    if (!databaseRow) throw new Error("数据库不存在或已禁用");
    await getPool().query(
      `INSERT INTO database_terminal_sessions
       (id,database_id,database_name,engine,status,remote_address)
       VALUES ($1,$2,$3,$4,'connecting',$5)`,
      [sessionId, databaseRow.id, databaseRow.name, databaseRow.engine, remoteAddress],
    );
    const credential = JSON.parse(decryptSecret(databaseRow.credential_encrypted));
    tunnel = await openDatabaseTunnel(databaseRow);
    const ssl = databaseSslOptions(databaseRow, credential);

    if (databaseRow.engine === "postgresql") {
      pgClient = new pg.Client({
        host: tunnel.stream ? undefined : databaseRow.host,
        port: databaseRow.port,
        user: databaseRow.username,
        password: credential.password,
        database: databaseRow.database_name,
        ssl,
        connectionTimeoutMillis: 15_000,
        ...(tunnel.stream ? { stream: () => tunnel.stream } : {}),
      });
      await pgClient.connect();
      await pgClient.query("SET statement_timeout = 30000");
    } else {
      mysqlConnection = mysql.createConnection({
        host: tunnel.stream ? undefined : databaseRow.host,
        port: databaseRow.port,
        user: databaseRow.username,
        password: credential.password,
        database: databaseRow.database_name,
        ssl,
        connectTimeout: 15_000,
        ...(tunnel.stream ? { stream: tunnel.stream } : {}),
        supportBigNumbers: true,
        bigNumberStrings: true,
      });
      await new Promise((resolve, reject) =>
        mysqlConnection.connect((error) => error ? reject(error) : resolve()),
      );
    }
    await getPool().query(
      "UPDATE database_terminal_sessions SET status='connected',connected_at=NOW() WHERE id=$1",
      [sessionId],
    );
    maximumTimer = setTimeout(
      () => finish("closed", "会话达到 8 小时上限"),
      8 * 60 * 60 * 1000,
    );
    resetIdleTimer();
    sendJson({
      type: "status",
      status: "ready",
      sessionId,
      engine: databaseRow.engine,
      databaseName: databaseRow.database_name,
    });

    websocket.on("message", async (raw, isBinary) => {
      if (isBinary || finished) return;
      bytesIn += raw.length;
      resetIdleTimer();
      try {
        const message = JSON.parse(raw.toString("utf8"));
        if (message.type !== "query" || typeof message.sql !== "string") return;
        const sql = message.sql.trim();
        if (!sql || Buffer.byteLength(sql) > 64 * 1024) {
          sendJson({ type: "error", message: "SQL 不能为空且不能超过 64 KB" });
          return;
        }
        if (busy) {
          sendJson({ type: "error", message: "上一条 SQL 尚未执行完成" });
          return;
        }
        busy = true;
        queryCount += 1;
        const startedAt = Date.now();
        try {
          let rawRows;
          let columns;
          let affectedRows;
          if (pgClient) {
            const queryResult = await pgClient.query(sql);
            const finalResult = Array.isArray(queryResult)
              ? queryResult[queryResult.length - 1]
              : queryResult;
            rawRows = finalResult?.rows || [];
            columns = finalResult?.fields?.map((field) => field.name) || [];
            affectedRows = finalResult?.rowCount ?? 0;
          } else {
            const queryResult = await new Promise((resolve, reject) =>
              mysqlConnection.query(
                { sql, timeout: 30_000 },
                (error, rows, fields) => error
                  ? reject(error)
                  : resolve({ rows, fields }),
              ),
            );
            rawRows = Array.isArray(queryResult.rows) ? queryResult.rows : [];
            columns = Array.isArray(queryResult.fields)
              ? queryResult.fields.map((field) => field.name)
              : [];
            affectedRows =
              !Array.isArray(queryResult.rows) && queryResult.rows
                ? queryResult.rows.affectedRows || 0
                : rawRows.length;
          }
          const limited = limitDatabaseRows(rawRows);
          sendJson({
            type: "result",
            columns,
            rows: limited.rows,
            rowCount: rawRows.length || affectedRows,
            truncated: limited.truncated,
            durationMs: Date.now() - startedAt,
          });
        } catch (error) {
          sendJson({
            type: "query-error",
            message: error instanceof Error ? error.message.slice(0, 4096) : "SQL 执行失败",
            durationMs: Date.now() - startedAt,
          });
        } finally {
          busy = false;
        }
      } catch {
        sendJson({ type: "error", message: "数据库终端消息格式无效" });
      }
    });
    websocket.on("close", () => finish("closed", "浏览器已断开"));
    websocket.on("error", (error) => finish("failed", error.message));
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据库终端连接失败";
    sendJson({ type: "error", message });
    await finish("failed", message);
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumedTickets) {
    if (expiresAt < now) consumedTickets.delete(nonce);
  }
}, 60_000).unref();

server.listen(port, hostname, () => {
  console.log(`> Dev Buddy ready on http://${hostname}:${port}`);
});
