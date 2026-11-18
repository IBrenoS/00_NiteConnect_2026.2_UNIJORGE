import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { visualCatalog, visualParticipationIds } from "../../../../lib/projects/visual-data";
import { ProjectWorkspaceShell } from "../../../../components/projects/project-workspace";
export default async function WorkspaceLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  // Synthetic data only. Real project access remains in the API.
  if (!visualCatalog.some(p => p.id === id) || (!visualParticipationIds.includes(id) && !session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR"))) notFound();
  return <ProjectWorkspaceShell projectId={id}>{children}</ProjectWorkspaceShell>;
}
