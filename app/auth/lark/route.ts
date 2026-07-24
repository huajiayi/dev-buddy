import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { safeReturnPath } from "@/lib/auth";
import { buildLarkAuthorizeUrl, isLarkConfigured, larkRedirectUri } from "@/lib/lark-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isLarkConfigured()) return NextResponse.redirect(new URL("/login?error=lark_not_configured", request.url));
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = larkRedirectUri(request.nextUrl.origin);
  const response = NextResponse.redirect(buildLarkAuthorizeUrl({ redirectUri, state, codeChallenge: challenge }));
  const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  response.cookies.set("dev_buddy_lark_state", state, cookieOptions);
  response.cookies.set("dev_buddy_lark_verifier", verifier, cookieOptions);
  response.cookies.set("dev_buddy_lark_next", safeReturnPath(request.nextUrl.searchParams.get("next")), cookieOptions);
  return response;
}
