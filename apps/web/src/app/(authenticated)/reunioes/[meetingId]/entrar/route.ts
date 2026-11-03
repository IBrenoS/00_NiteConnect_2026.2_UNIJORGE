import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../../lib/api/server";
import { meetingJoinErrorHref, meetingJoinFailureFeedback } from "../../../../../lib/meetings/meeting-join-feedback";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redirectToJoinError(request: NextRequest, reason: "forbidden" | "session-required" | "not-found" | "unavailable", meetingId?: string) {
  const response = NextResponse.redirect(new URL(meetingJoinErrorHref(reason, meetingId), request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  if (!uuidPattern.test(meetingId)) return redirectToJoinError(request, "not-found");
  const session = await getAuthenticatedNiteSession();
  if (!session) return NextResponse.redirect(new URL("/login", request.url), 303);
  const url = resolveApiUrl(`/api/v1/meetings/${encodeURIComponent(meetingId)}/join`);
  if (!url) return redirectToJoinError(request, "unavailable", meetingId);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.bearer}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 303) {
      const payload: unknown = await response.clone().json().catch(() => null);
      const code = typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string" ? payload.code : null;
      const feedback = meetingJoinFailureFeedback(response.status, code);
      if (feedback === "consent-required") {
        const redirect = NextResponse.redirect(new URL("/reunioes/erro-403", request.url), 303);
        redirect.headers.set("Cache-Control", "no-store");
        redirect.headers.set("Referrer-Policy", "no-referrer");
        return redirect;
      }
      return redirectToJoinError(request, feedback, meetingId);
    }
    const location = response.headers.get("location");
    if (!location) return redirectToJoinError(request, "unavailable", meetingId);
    const destination = new URL(location);
    if (destination.protocol !== "https:" || destination.hostname !== "teams.microsoft.com" || destination.port || destination.username || destination.password) return redirectToJoinError(request, "unavailable", meetingId);
    const redirect = NextResponse.redirect(destination, 303);
    redirect.headers.set("Cache-Control", "no-store");
    redirect.headers.set("Referrer-Policy", "no-referrer");
    return redirect;
  } catch {
    return redirectToJoinError(request, "unavailable", meetingId);
  }
}
