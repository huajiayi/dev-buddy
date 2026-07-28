import { NextRequest, NextResponse } from "next/server";
import { confirmationRequired } from "@/lib/api-confirmation";
import { ApiAuthenticationError, requireAdminApiKey } from "@/lib/api-auth";
import {
  listDatabaseQueryPolicies,
  removeDatabaseQueryPolicy,
  updateDatabaseQueryPolicy,
} from "@/lib/database-management";
import { parsePolicyApiInput, PolicyApiInputError } from "@/lib/policy-api";

export const runtime = "nodejs";

function authError(error: unknown) {
  if (!(error instanceof ApiAuthenticationError)) return null;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApiKey(request);
    const { id } = await params;
    const policies = await listDatabaseQueryPolicies();
    const target = policies.find((policy) => policy.id === id);
    if (!target) return NextResponse.json({ error: "policy_not_found", message: "SQL 策略不存在" }, { status: 404 });
    const confirmation = confirmationRequired(request, "update-database-policy");
    if (confirmation) return confirmation;
    const input = parsePolicyApiInput(await request.json());
    const duplicate = policies.find((policy) => policy.id !== id && policy.name === input.name);
    if (duplicate) {
      return NextResponse.json({ error: "policy_exists", message: "同名 SQL 策略已存在", data: duplicate }, { status: 409 });
    }
    await updateDatabaseQueryPolicy({ id, ...input });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    if (error instanceof PolicyApiInputError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    return authError(error) || NextResponse.json(
      { error: "policy_update_failed", message: error instanceof Error ? error.message : "SQL 策略更新失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApiKey(request);
    const { id } = await params;
    const target = (await listDatabaseQueryPolicies()).find((policy) => policy.id === id);
    if (!target) return NextResponse.json({ error: "policy_not_found", message: "SQL 策略不存在" }, { status: 404 });
    const confirmation = confirmationRequired(request, "delete-database-policy");
    if (confirmation) return confirmation;
    await removeDatabaseQueryPolicy(id);
    return NextResponse.json({ data: { id, name: target.name, deleted: true } });
  } catch (error) {
    return authError(error) || NextResponse.json(
      { error: "policy_delete_failed", message: error instanceof Error ? error.message : "SQL 策略删除失败" },
      { status: 400 },
    );
  }
}
