import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "登录状态已失效，请重新登录" },
      { status: 401 },
    );
  }
  return NextResponse.json({ data: user }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
