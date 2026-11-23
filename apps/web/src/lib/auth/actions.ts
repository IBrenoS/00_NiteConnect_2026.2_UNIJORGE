"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth, signIn, signOut } from "../../../auth";
import { isAuthConfigured, meetingsGraphConsentScope } from "./config";

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
