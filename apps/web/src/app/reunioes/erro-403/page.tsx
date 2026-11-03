import type { Metadata } from "next";
import { GraphAuthorizationPage } from "../../../components/meetings/graph-authorization-page";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";

export const metadata: Metadata = { title: "Autorização Microsoft 365" };
export const dynamic = "force-dynamic";

export default async function GraphAuthorizationErrorPage() {
  const session = await requireAuthenticatedNiteSession();
  return <GraphAuthorizationPage viewerId={session.member.id} />;
}
