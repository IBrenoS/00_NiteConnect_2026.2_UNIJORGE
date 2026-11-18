import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { resolveNiteToken, authSessionCookieName } from "../../../auth";
import { parseNiteIdentity, type NiteMember } from "./identity";

export type AuthenticatedNiteSession = {
  member: NiteMember;
  roles: string[];
  bearer: string;
};

export const getAuthenticatedNiteSession = cache(async (): Promise<AuthenticatedNiteSession | null> => {
  const original = process.env.AUTH_SECRET
    ? await getToken({
        req: { headers: await headers() },
        secret: process.env.AUTH_SECRET,
        cookieName: authSessionCookieName,
        secureCookie: process.env.NODE_ENV === "production",
      })
    : null;
  if (!original) return null;
  // Resolve identity and bearer from the same refreshed token, never the stale cookie.
  const token = await resolveNiteToken(original);
  const identity = parseNiteIdentity({ member: token.niteMember, roles: token.niteRoles });
  if (!identity || token.authError) return null;
  const bearer = token.accessToken;
  if (typeof bearer !== "string" || bearer.length === 0) return null;
  return { ...identity, bearer };
});

export async function requireAuthenticatedNiteSession(): Promise<AuthenticatedNiteSession> {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  return session;
}
