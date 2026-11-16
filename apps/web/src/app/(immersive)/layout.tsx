import type { ReactNode } from "react";
import { requireAuthenticatedNiteSession } from "../../lib/auth/server-session";

export const dynamic = "force-dynamic";

export default async function ImmersiveLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAuthenticatedNiteSession();
  return children;
}
