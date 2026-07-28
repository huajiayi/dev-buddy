import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { parsePolicyApiInput, PolicyApiInputError } from "@/lib/policy-api";
import { authenticateProjectApiKey, createCommandPolicy, listCommandPolicies } from "@/lib/server-management";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) {
    return NextResponse.json(
      { error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" },
      { status: 401 },
    );
  }
  return NextResponse.json({ data: await listCommandPolicies() });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "unsupported_media_type", message: "Content-Type 必须是 application/json" },
      { status: 415 },
    );
  }
  const apiKey = await authenticateProjectApiKey(bearerToken(request));
  if (!apiKey) {
    return NextResponse.json(
      { error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" },
      { status: 401 },
    );
  }
  if (apiKey.ownerRole !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "只有管理员可以新增命令策略" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "请求体不是有效 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request", message: "请求体格式错误" }, { status: 400 });
  }

  try {
    const input = parsePolicyApiInput(body);
    const confirmation = confirmationRequired(request, "create-command-policy");
    if (confirmation) return confirmation;

    const existing = (await listCommandPolicies()).find((policy) => policy.name === input.name);
    if (existing) {
      return NextResponse.json(
        { error: "policy_exists", message: "同名命令策略已存在", data: existing },
        { status: 409 },
      );
    }

    const id = await createCommandPolicy(input);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof PolicyApiInputError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "policy_create_failed", message: error instanceof Error ? error.message : "命令策略创建失败" },
      { status: 500 },
    );
  }
}
