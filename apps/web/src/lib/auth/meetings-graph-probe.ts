import "server-only";

export type MeetingCalendarCapabilities = {
  allowedOnlineMeetingProviders: string[];
  defaultOnlineMeetingProvider: string;
  supportsTeamsForBusiness: boolean;
};

export type MeetingCalendarProbeResult =
  | { status: "AVAILABLE"; capabilities: MeetingCalendarCapabilities }
  | { status: "API_ERROR"; httpStatus: number; code: string | null }
  | { status: "UNAVAILABLE" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isSafeApiOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && isLoopback(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function parseCapabilities(value: unknown): MeetingCalendarCapabilities | null {
  if (!isRecord(value)) return null;
  const providers = value.allowedOnlineMeetingProviders;
  if (!Array.isArray(providers) || !providers.every((provider) => typeof provider === "string")
    || typeof value.defaultOnlineMeetingProvider !== "string"
    || typeof value.supportsTeamsForBusiness !== "boolean") return null;
  return {
    allowedOnlineMeetingProviders: providers,
    defaultOnlineMeetingProvider: value.defaultOnlineMeetingProvider,
    supportsTeamsForBusiness: value.supportsTeamsForBusiness,
  };
}

function problemCode(value: unknown): string | null {
  if (!isRecord(value) || typeof value.code !== "string" || !/^[A-Z0-9_]{1,80}$/.test(value.code)) return null;
  return value.code;
}

export async function probeMeetingCalendar(
  apiAccessToken: string,
  apiBaseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<MeetingCalendarProbeResult> {
  const base = isSafeApiOrigin(apiBaseUrl);
  if (!base || !apiAccessToken) return { status: "UNAVAILABLE" };

  try {
    const endpoint = new URL("/api/v1/meetings/calendar/capabilities", base);
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiAccessToken}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      let payload: unknown;
      try { payload = await response.json(); }
      catch { payload = null; }
      return { status: "API_ERROR", httpStatus: response.status, code: problemCode(payload) };
    }

    let payload: unknown;
    try { payload = await response.json(); }
    catch { return { status: "UNAVAILABLE" }; }
    const capabilities = parseCapabilities(payload);
    return capabilities ? { status: "AVAILABLE", capabilities } : { status: "UNAVAILABLE" };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
