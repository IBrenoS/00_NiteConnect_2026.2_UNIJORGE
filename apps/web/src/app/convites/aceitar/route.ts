import { NextResponse } from "next/server";
import { getAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { acceptInvitationForSignIn } from "../../../lib/auth/invitation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.redirect(new URL("/convites/resultado?status=invalid", url));
  }
  const session = await getAuthenticatedNiteSession();
  if (session) {
    let status: string;
    try { status = await acceptInvitationForSignIn(id, session.bearer, process.env.API_BASE_URL ?? ""); }
    catch { status = "temporary-failure"; }
    const existing = NextResponse.redirect(new URL(`/convites/resultado?status=${status}`, url));
    if (status === "success") existing.cookies.set("nite-invitation-success", "1", { httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production", path: "/convites/resultado", maxAge: 300 });
    existing.headers.set("Referrer-Policy", "no-referrer");
    existing.headers.set("Cache-Control", "no-store");
    return existing;
  }
  const response = NextResponse.redirect(new URL("/login", url));
  response.cookies.set("nite-invitation", id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 600,
  });
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
