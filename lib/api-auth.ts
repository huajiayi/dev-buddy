import "server-only";

import type { NextRequest } from "next/server";
import { authenticateProjectApiKey } from "./server-management";

export class ApiAuthenticationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403,
    public readonly code: "invalid_api_key" | "forbidden",
  ) {
    super(message);
  }
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function requireAdminApiKey(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) {
    throw new ApiAuthenticationError("API Key 无效、已禁用或已过期", 401, "invalid_api_key");
  }
  if (apiKey.ownerRole !== "admin") {
    throw new ApiAuthenticationError("只有管理员身份可以管理用户和资源权限", 403, "forbidden");
  }
  return apiKey;
}
