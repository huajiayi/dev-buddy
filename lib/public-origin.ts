type RequestOriginSource = {
  headers: Headers;
  nextUrl: {
    origin: string;
    protocol: string;
  };
};

function configuredOrigin() {
  for (const value of [process.env.APP_URL, process.env.LARK_REDIRECT_URI]) {
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      // Ignore invalid optional configuration and continue with request headers.
    }
  }
  return null;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function publicRequestOrigin(request: RequestOriginSource) {
  const configured = configuredOrigin();
  if (configured) return configured;

  const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
    || firstHeaderValue(request.headers.get("host"));
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
    || request.nextUrl.protocol.replace(":", "");

  if (host && (protocol === "http" || protocol === "https")) {
    return `${protocol}://${host}`;
  }
  return request.nextUrl.origin;
}
