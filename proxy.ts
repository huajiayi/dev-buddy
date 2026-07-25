import { NextRequest, NextResponse } from "next/server";
import { publicRequestOrigin } from "@/lib/public-origin";
const publicPaths = ["/login", "/setup", "/auth/lark"];
const SESSION_COOKIE = "dev_buddy_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
  if (pathname.startsWith("/api/v1/")) return NextResponse.next();
  const legacyRoutes = [
    { pattern: /^\/servers\/([0-9a-f-]{36})\/terminal$/i, target: "/server-terminal" },
    { pattern: /^\/servers\/([0-9a-f-]{36})\/ssh-terminal$/i, target: "/ssh-terminal" },
    { pattern: /^\/databases\/([0-9a-f-]{36})\/workbench$/i, target: "/database-workbench" },
    { pattern: /^\/aliyun\/([0-9a-f-]{36})$/i, target: "/aliyun-account" },
  ];
  for (const route of legacyRoutes) {
    const match = pathname.match(route.pattern);
    if (match) {
      const destination = new URL(route.target, publicRequestOrigin(request));
      destination.searchParams.set("id", match[1]);
      return NextResponse.redirect(destination);
    }
  }
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", publicRequestOrigin(request));
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
