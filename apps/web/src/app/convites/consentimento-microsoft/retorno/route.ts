import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

const cookieName = process.env.NODE_ENV === "production"
  ? "__Host-nite-invitation-directory-consent-state"
  : "nite-invitation-directory-consent-state";

export async function GET(request: NextRequest) {
  const expectedState = (await cookies()).get(cookieName)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const valid = Boolean(expectedState && state && expectedState === state);
  (await cookies()).delete(cookieName);

  const destination = new URL("/gestao/acessos-e-convites?tab=convites", request.url);
  destination.searchParams.set("directoryConsent", !valid ? "invalid" : error ? "denied" : "granted");
  // The authorization code is intentionally neither redeemed nor included in the redirect.
  return NextResponse.redirect(destination, 303);
}
