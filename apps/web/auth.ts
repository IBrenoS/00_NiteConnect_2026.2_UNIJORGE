import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type {} from "./src/lib/auth/types";
import type { JWT } from "next-auth/jwt";
import { getNiteIdentity, NiteApiUnauthorizedError } from "./src/lib/auth/api";
import { entraIssuer } from "./src/lib/auth/config";
import { refreshEntraToken } from "./src/lib/auth/tokens";
import { parseNiteIdentity } from "./src/lib/auth/identity";

const providerId = "microsoft-entra-id";
const sessionDurationSeconds = 8 * 60 * 60;
const refreshBufferMs = 2 * 60 * 1_000;
export const authSessionCookieName = process.env.NODE_ENV === "production"
  ? "__Host-nite-connect.session"
  : "nite-connect.session";
type AuthError = "AccessDenied" | "SessionExpired";

function hasTokenCredentials(
  token: JWT,
): token is JWT & {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: number;
  authError?: AuthError;
} {
  const error = token["authError"];
  return (
    typeof token["accessToken"] === "string" &&
    typeof token["accessTokenExpiresAt"] === "number" &&
    (token["refreshToken"] === undefined || typeof token["refreshToken"] === "string") &&
    (error === undefined || error === "AccessDenied" || error === "SessionExpired")
  );
}

export async function resolveNiteToken(token: JWT): Promise<JWT> {
  if (!hasTokenCredentials(token)) return { ...token, authError: "SessionExpired" };
  if (token.authError) return token;
  if (Date.now() < token.accessTokenExpiresAt - refreshBufferMs) return token;
  if (!token.refreshToken) return { ...token, authError: "SessionExpired" };

  try {
    const refreshed = await refreshEntraToken({
      refreshToken: token.refreshToken,
      tenantId: process.env.ENTRA_TENANT_ID ?? "",
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
      apiScope: process.env.ENTRA_API_SCOPE ?? "",
    });
    const identity = await getNiteIdentity(refreshed.accessToken, process.env.API_BASE_URL ?? "");
    return {
      ...token,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: refreshed.expiresAt,
      niteMember: identity.member,
      niteRoles: identity.roles,
      authError: undefined,
    };
  } catch (error) {
    return {
      ...token,
      authError: error instanceof NiteApiUnauthorizedError ? "AccessDenied" : "SessionExpired",
    };
  }
}

const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  session: { strategy: "jwt", maxAge: sessionDurationSeconds },
  cookies: {
    sessionToken: {
      name: authSessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
      issuer: entraIssuer(),
      authorization: {
        params: {
          scope: `openid profile email offline_access ${process.env.ENTRA_API_SCOPE ?? ""}`.trim(),
        },
      },
      profile(profile) {
        if (!profile.sub) throw new TypeError("A resposta OIDC não contém o identificador do usuário.");
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username ?? null,
          email: profile.email ?? profile.preferred_username ?? null,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== providerId || !account.access_token) return false;
      try {
        const identity = await getNiteIdentity(account.access_token, process.env.API_BASE_URL ?? "");
        user.niteMember = identity.member;
        user.niteRoles = identity.roles;
        return true;
      } catch (error) {
        if (error instanceof NiteApiUnauthorizedError) return false;
        throw error;
      }
    },
    async jwt({ token, account, user }) {
      if (account?.provider === providerId) {
        if (!account.access_token || !user.niteMember || !user.niteRoles) {
          return { ...token, authError: "AccessDenied" };
        }
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpiresAt: (account.expires_at ?? Math.floor(Date.now() / 1_000 + 3_600)) * 1_000,
          niteMember: user.niteMember,
          niteRoles: user.niteRoles,
          authError: undefined,
        };
      }

      return resolveNiteToken(token);
    },
    async session({ session, token }) {
      const identity = parseNiteIdentity({ member: token["niteMember"], roles: token["niteRoles"] });
      const error = token["authError"];
      session.niteMember = identity?.member;
      session.niteRoles = identity?.roles;
      session.error = error === "AccessDenied" || error === "SessionExpired" ? error : undefined;
      if (session.niteMember) {
        session.user = {
          ...session.user,
          name: session.niteMember.name,
          email: session.niteMember.institutionalEmail,
        };
      }
      return session;
    },
  },
});

export { auth, handlers, signIn, signOut };
