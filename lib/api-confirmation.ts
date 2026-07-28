import { NextResponse } from "next/server";

type RequestWithHeaders = {
  headers: {
    get(name: string): string | null;
  };
};

export const CONFIRMATION_HEADER = "x-dev-buddy-confirm";

export function confirmationRequired(request: RequestWithHeaders, action: string) {
  if (request.headers.get(CONFIRMATION_HEADER) === action) return null;
  return NextResponse.json(
    {
      error: "confirmation_required",
      message: "该高风险操作需要二次确认",
      confirmationAction: action,
    },
    { status: 428 },
  );
}
