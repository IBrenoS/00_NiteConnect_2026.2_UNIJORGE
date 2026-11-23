"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth, signIn, signOut } from "../../../auth";
import { invitationDirectoryConsentRequest, isAuthConfigured, meetingsGraphConsentScope } from "./config";

export async function signInWithMicrosoft(): Promise<void> {
  if (!isAuthConfigured()) redirect("/login?error=Configuration");
  const handoff = (await cookies()).get("__Host-nite-frequency-handoff")?.value;
  const invitation = (await cookies()).get("nite-invitation")?.value;
  const redirectTo = invitation ? "/convites/resultado?status=success"
    : handoff && /^[A-Za-z0-9_-]{32,64}$/.test(handoff) ? "/frequency/confirm" : "/dashboard";
  await signIn("microsoft-entra-id", { redirectTo });
}

export async function signOutOfNite(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function requestMeetingsGraphConsent(): Promise<void> {
  if (process.env.NODE_ENV !== "development") redirect("/dashboard");
  if (!isAuthConfigured()) redirect("/login?error=Configuration");

  const session = await auth();
  if (!session?.niteMember || session.error || session.niteMember.status !== "ATIVO") redirect("/login");

  const scope = meetingsGraphConsentScope(process.env.ENTRA_API_SCOPE);
  if (!scope) redirect("/login?error=Configuration");

  await signIn(
    "microsoft-entra-id",
    { redirectTo: "/reunioes/integracao/microsoft/calendario" },
    { scope: `openid ${scope}` },
  );
}

export async function requestInvitationDirectoryConsent(): Promise<void> {
  if (!isAuthConfigured()) redirect("/login?error=Configuration");
  const session = await auth();
  const roles = session?.niteRoles ?? [];
  if (!session?.niteMember || session.error || session.niteMember.status !== "ATIVO"
      || !roles.some((role) => role === "GESTOR_GERAL" || role === "COORDENADOR")) redirect("/login");

  const api = invitationDirectoryConsentRequest(process.env.ENTRA_API_SCOPE);
  const tenantId = process.env.ENTRA_TENANT_ID;
  const appUrl = process.env.AUTH_URL;
  if (!api || !tenantId || !appUrl) redirect("/gestao/acessos-e-convites?tab=convites&directoryConsent=configuration");

  const state = randomBytes(32).toString("base64url");
  const cookieName = process.env.NODE_ENV === "production"
    ? "__Host-nite-invitation-directory-consent-state"
    : "nite-invitation-directory-consent-state";
  (await cookies()).set(cookieName, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = new URL("/convites/consentimento-microsoft/retorno", appUrl).toString();
  const authorize = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authorize.searchParams.set("client_id", api.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", `openid ${api.scope}`);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");
  redirect(authorize.toString());
}
