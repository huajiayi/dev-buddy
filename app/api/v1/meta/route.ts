import { NextResponse } from "next/server";
import { getDevBuddyVersionInfo } from "@/lib/dev-buddy-version";

export const dynamic = "force-dynamic";

export function GET() {
  const data = getDevBuddyVersionInfo();
  return NextResponse.json({ data }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Dev-Buddy-Server-Version": data.serverVersion,
      "X-Dev-Buddy-Skill-Version": data.recommendedSkillVersion,
    },
  });
}
