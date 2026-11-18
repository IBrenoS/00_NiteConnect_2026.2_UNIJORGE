import type { ReactNode } from "react";
import { AuthenticatedShell } from "../../components/shell/authenticated-shell";
import { requireAuthenticatedNiteSession } from "../../lib/auth/server-session";
import { getLeadershipProjects } from "../../lib/projects/data";
import { ProjectVisualProvider } from "../../components/projects/project-visual-provider";

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
      <ProjectVisualProvider canAdminister={session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR")}>{children}</ProjectVisualProvider>
    </AuthenticatedShell>
  );
}
