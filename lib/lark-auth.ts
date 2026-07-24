import "server-only";

import type { LarkProfile } from "./auth";

type TokenResponse = {
  code?: number;
  error?: string;
  error_description?: string;
  msg?: string;
  access_token?: string;
};

type UserInfoResponse = {
  code: number;
  msg?: string;
  data?: {
    open_id?: string;
    union_id?: string;
    tenant_key?: string;
    name?: string;
    en_name?: string;
    email?: string;
    enterprise_email?: string;
    avatar_url?: string;
  };
};

export function isLarkConfigured() {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

function origins() {
  const china = process.env.LARK_SITE === "china";
  return {
    accounts: process.env.LARK_ACCOUNTS_ORIGIN || (china ? "https://accounts.feishu.cn" : "https://accounts.larksuite.com"),
    api: process.env.LARK_API_ORIGIN || (china ? "https://open.feishu.cn" : "https://open.larksuite.com"),
  };
}

export function larkRedirectUri(requestOrigin: string) {
  return process.env.LARK_REDIRECT_URI || `${requestOrigin}/auth/lark/callback`;
}

export function buildLarkAuthorizeUrl(input: { redirectUri: string; state: string; codeChallenge: string }) {
  if (!process.env.LARK_APP_ID) throw new Error("Lark 登录尚未配置");
  const url = new URL("/open-apis/authen/v1/authorize", origins().accounts);
  url.searchParams.set("client_id", process.env.LARK_APP_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", process.env.LARK_SCOPES || "auth:user.id:read");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeLarkCode(input: { code: string; redirectUri: string; codeVerifier: string }) {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) throw new Error("Lark 登录尚未配置");
  const response = await fetch(new URL("/open-apis/authen/v2/oauth/token", origins().api), {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.LARK_APP_ID,
      client_secret: process.env.LARK_APP_SECRET,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const token = await response.json() as TokenResponse;
  if (!response.ok || token.code || !token.access_token) {
    throw new Error(token.error_description || token.msg || token.error || "Lark 授权码交换失败");
  }
  return token.access_token;
}

export async function getLarkProfile(accessToken: string): Promise<LarkProfile> {
  const response = await fetch(new URL("/open-apis/authen/v1/user_info", origins().api), {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json() as UserInfoResponse;
  if (!response.ok || body.code !== 0 || !body.data?.open_id) {
    throw new Error(body.msg || "无法获取 Lark 用户信息");
  }
  return {
    openId: body.data.open_id,
    unionId: body.data.union_id || null,
    tenantKey: body.data.tenant_key || null,
    name: body.data.name || body.data.en_name || "Lark 用户",
    email: body.data.enterprise_email || body.data.email || null,
    avatarUrl: body.data.avatar_url || null,
  };
}
