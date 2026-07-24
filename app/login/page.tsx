import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUsers, safeReturnPath } from "@/lib/auth";
import { isLarkConfigured } from "@/lib/lark-auth";
import LoginView from "./login-view";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  lark_not_configured: "Lark 登录尚未配置",
  lark_state_invalid: "Lark 登录请求已失效，请重试",
  lark_denied: "你取消了 Lark 授权",
  lark_failed: "Lark 登录失败，请重试或联系管理员",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const query = await searchParams;
  const returnTo = safeReturnPath(query.next);
  if (!(await hasAnyUsers())) redirect("/setup");
  if (await getCurrentUser()) redirect(returnTo);
  return <LoginView
    larkEnabled={isLarkConfigured()}
    larkUrl={`/auth/lark?next=${encodeURIComponent(returnTo)}`}
    returnTo={returnTo}
    initialError={query.error ? errorMessages[query.error] || "登录失败" : undefined}
  />;
}
