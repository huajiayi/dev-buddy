import { NextRequest, NextResponse } from "next/server";
import { publicRequestOrigin } from "@/lib/public-origin";
import {
  evaluateSkillCompatibility,
  getDevBuddyVersionInfo,
  readSkillClientVersion,
} from "@/lib/dev-buddy-version";

const publicPaths = ["/login", "/setup", "/auth/lark"];
const SESSION_COOKIE = "dev_buddy_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/v1/")) {
    if (pathname === "/api/v1/meta") return NextResponse.next();

    const clientVersion = readSkillClientVersion(
      request.headers.get("x-dev-buddy-skill-version"),
      request.headers.get("user-agent"),
    );
    const compatibility = evaluateSkillCompatibility(clientVersion);
    const version = getDevBuddyVersionInfo();

    if (compatibility.status === "update-required" || compatibility.status === "invalid") {
      return NextResponse.json({
        error: "skill_update_required",
        message: `Dev Buddy Skill ${compatibility.clientVersion} 与当前服务端不兼容，请更新到 ${version.recommendedSkillVersion}`,
        currentVersion: compatibility.clientVersion,
        minVersion: version.minSkillVersion,
        latestVersion: version.recommendedSkillVersion,
        updateUrl: version.skillSourceUrl,
      }, {
        status: 426,
        headers: {
          "Cache-Control": "no-store",
          "X-Dev-Buddy-Skill-Version": version.recommendedSkillVersion,
        },
      });
    }

    const response = NextResponse.next();
    response.headers.set("X-Dev-Buddy-Server-Version", version.serverVersion);
    response.headers.set("X-Dev-Buddy-Skill-Version", version.recommendedSkillVersion);
    if (compatibility.status === "update-available") {
      response.headers.set("X-Dev-Buddy-Skill-Update", "available");
    } else if (compatibility.status === "server-older") {
      response.headers.set("X-Dev-Buddy-Server-Update", "recommended");
    }
    return response;
  }

  if (publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();
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
