"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signIn, signOut } from "../../../auth";
import { isAuthConfigured } from "./config";

export async function signInWithMicrosoft(): Promise<void> {
  if (!isAuthConfigured()) redirect("/login?error=Configuration");
  const handoff = (await cookies()).get("__Host-nite-frequency-handoff")?.value;
  const redirectTo = handoff && /^[A-Za-z0-9_-]{32,64}$/.test(handoff) ? "/frequency/confirm" : "/dashboard";
  await signIn("microsoft-entra-id", { redirectTo });
}

export async function signOutOfNite(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
