import { NextRequest, NextResponse } from "next/server";
import { createSession, findOrCreateLarkUser, safeReturnPath } from "@/lib/auth";
import { exchangeLarkCode, getLarkProfile, larkRedirectUri } from "@/lib/lark-auth";
import { publicRequestOrigin } from "@/lib/public-origin";

export const runtime = "nodejs";

function loginError(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${code}`, publicRequestOrigin(request)));
  response.cookies.delete("dev_buddy_lark_state");
  response.cookies.delete("dev_buddy_lark_verifier");
  response.cookies.delete("dev_buddy_lark_next");
  return response;
}

export async function GET(request: NextRequest) {
  const publicOrigin = publicRequestOrigin(request);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("dev_buddy_lark_state")?.value;
  const verifier = request.cookies.get("dev_buddy_lark_verifier")?.value;
  if (request.nextUrl.searchParams.get("error")) return loginError(request, "lark_denied");
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return loginError(request, "lark_state_invalid");

  try {
    const redirectUri = larkRedirectUri(publicOrigin);
    const token = await exchangeLarkCode({ code, redirectUri, codeVerifier: verifier });
    const user = await findOrCreateLarkUser(await getLarkProfile(token));
    await createSession(user.id);
    const response = NextResponse.redirect(new URL(safeReturnPath(request.cookies.get("dev_buddy_lark_next")?.value), publicOrigin));
    response.cookies.delete("dev_buddy_lark_state");
    response.cookies.delete("dev_buddy_lark_verifier");
    response.cookies.delete("dev_buddy_lark_next");
    return response;
  } catch (error) {
    console.error("Lark 登录失败", error instanceof Error ? error.message : error);
    return loginError(request, "lark_failed");
  }
}
