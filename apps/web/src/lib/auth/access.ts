import "server-only";

/** Called only while rendering an authenticated application page, never on token refresh. */
export async function recordApplicationEntry(bearer: string): Promise<void> {
  try {
    const endpoint = new URL("/api/v1/me/access", process.env.API_BASE_URL);
    await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // An access timestamp must not prevent application use during telemetry failure.
  }
}
