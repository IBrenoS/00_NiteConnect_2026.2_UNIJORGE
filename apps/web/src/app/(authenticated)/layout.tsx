import type { ReactNode } from "react";
import { AuthenticatedShell } from "../../components/shell/authenticated-shell";
import { requireAuthenticatedNiteSession } from "../../lib/auth/server-session";
import { getLeadershipProjects } from "../../lib/projects/data";
import { AccessPresence } from "../../components/auth/access-presence";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireAuthenticatedNiteSession();
  const leadershipResult = await getLeadershipProjects(session.bearer);

  return (
    <AuthenticatedShell
      member={session.member}
      roles={session.roles}
      projects={leadershipResult.data ?? []}
      leadershipProjectsUnavailable={leadershipResult.issue !== null}
    >
      <AccessPresence />
      {children}
    </AuthenticatedShell>
  );
}
