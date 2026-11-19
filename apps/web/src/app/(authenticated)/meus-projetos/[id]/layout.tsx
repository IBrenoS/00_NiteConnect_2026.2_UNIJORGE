import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getProjectWorkspace, getAllMyProjectIds } from "../../../../lib/projects/data";
import { ProjectWorkspaceShell } from "../../../../components/projects/project-workspace";
import { ProjectIssue } from "../../../../components/projects/project-ui";
export default async function WorkspaceLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
  if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
  if (!workspace.data.capabilities.canAccessWorkspace) return <ProjectIssue issue="access"/>;
  const own = await getAllMyProjectIds(session.bearer);
  return <ProjectWorkspaceShell workspace={workspace.data} participates={own.data?.includes(id) ?? null}>{children}</ProjectWorkspaceShell>;
}
