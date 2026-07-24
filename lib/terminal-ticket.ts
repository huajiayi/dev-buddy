import "server-only";

import { createHmac, randomBytes } from "node:crypto";

const TICKET_TTL_MS = 60_000;

function getTicketSecret() {
  const secret =
    process.env.TERMINAL_TICKET_SECRET ||
    process.env.ALIYUN_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.POSTGRESQL_PASSWORD;
  if (!secret) {
    throw new Error("缺少 TERMINAL_TICKET_SECRET 或可复用的项目加密密钥");
  }
  return secret;
}

export function createSshTerminalTicket(serverId: string, actorUserId: string) {
  const payload = Buffer.from(JSON.stringify({
    kind: "ssh",
    targetId: serverId,
    actorUserId,
    exp: Date.now() + TICKET_TTL_MS,
    nonce: randomBytes(18).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", getTicketSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
