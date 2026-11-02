import { NextResponse } from "next/server";
import { resolveApiUrl } from "../../../../../lib/api/server";

export const dynamic = "force-dynamic";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const cookieName = "__Host-nite-frequency-handoff";
const retryGraceMs = 5 * 60 * 1_000;

function json(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: "QR inválido." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || !("qrToken" in body) || typeof body.qrToken !== "string" || !tokenPattern.test(body.qrToken)) return json({ message: "QR inválido." }, 400);
  const apiUrl = resolveApiUrl("/api/v1/frequency/qr/handoffs");
  if (!apiUrl) return json({ message: "A confirmação não está disponível agora." }, 503);
  try {
    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ qrToken: body.qrToken }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!apiResponse.ok) {
      const response = json({ message: "O QR expirou ou não está disponível." }, apiResponse.status === 409 ? 409 : apiResponse.status === 429 ? 429 : 503);
      const retryAfter = apiResponse.headers.get("Retry-After");
      if (retryAfter && apiResponse.status === 429) response.headers.set("Retry-After", retryAfter);
      return response;
    }
    const handoff: unknown = await apiResponse.json();
    if (typeof handoff !== "object" || handoff === null || !("handoffId" in handoff) || typeof handoff.handoffId !== "string" || !/^[A-Za-z0-9_-]{32,64}$/.test(handoff.handoffId) || !("expiresAt" in handoff) || typeof handoff.expiresAt !== "string") return json({ message: "A confirmação não está disponível agora." }, 503);
    const expiry = Date.parse(handoff.expiresAt);
    const maxAge = Math.min(120, Math.floor((expiry - Date.now()) / 1_000));
    if (!Number.isFinite(expiry) || maxAge <= 0) return json({ message: "O QR expirou ou não está disponível." }, 409);
    const response = json({ expiresAt: handoff.expiresAt }, 201);
    const cookieExpires = new Date(expiry + retryGraceMs);
    const cookieMaxAge = Math.floor((cookieExpires.getTime() - Date.now()) / 1_000);
    response.cookies.set(cookieName, handoff.handoffId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: cookieMaxAge,
      expires: cookieExpires,
    });
    return response;
  } catch {
    return json({ message: "A confirmação não está disponível agora." }, 503);
  }
}
