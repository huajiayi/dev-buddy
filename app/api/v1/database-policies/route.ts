import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { createDatabaseQueryPolicy, listDatabaseQueryPolicies } from "@/lib/database-management";
import { parsePolicyApiInput, PolicyApiInputError } from "@/lib/policy-api";
import { authenticateProjectApiKey } from "@/lib/server-management";

export const runtime = "nodejs";
function token(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  return NextResponse.json({ data: await listDatabaseQueryPolicies() });
}

export async function POST(request: NextRequest) {
  const apiKey = await authenticateProjectApiKey(token(request));
  if (!apiKey) return NextResponse.json({ error: "invalid_api_key", message: "API Key 无效、已禁用或已过期" }, { status: 401 });
  if (apiKey.ownerRole !== "admin") return NextResponse.json({ error: "forbidden", message: "只有管理员可以新增 SQL 策略" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  try {
    const input = parsePolicyApiInput(body);
    const confirmation = confirmationRequired(request, "create-database-policy");
    if (confirmation) return confirmation;
    const existing = (await listDatabaseQueryPolicies()).find((policy) => policy.name === input.name);
    if (existing) {
      return NextResponse.json(
        { error: "policy_exists", message: "同名 SQL 策略已存在", data: existing },
        { status: 409 },
      );
    }
    const id = await createDatabaseQueryPolicy(input);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof PolicyApiInputError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "policy_create_failed", message: error instanceof Error ? error.message : "策略创建失败" }, { status: 400 });
  }
}
