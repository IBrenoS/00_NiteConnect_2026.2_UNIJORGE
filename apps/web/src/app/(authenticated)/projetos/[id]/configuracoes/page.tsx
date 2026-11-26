import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectWorkspace, getProjectAuthority } from "../../../../../lib/projects/data";
import { ProjectSettingsAdministration } from "../../../../../components/projects/project-administration-contexts";
import { ProjectIssue } from "../../../../../components/projects/project-ui";
import styles from "../../../../../components/projects/project-administration-layout.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações do projeto" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
  if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
  const capabilities = workspace.data.capabilities;
  if (!capabilities.canEditProject && !capabilities.canManageMembers && !capabilities.canManageAvailability && !capabilities.canDeleteProject) return <ProjectIssue issue="access"/>;
  const authority = capabilities.canManageMembers ? await getProjectAuthority(session.bearer) : { data: { canCreate: false }, issue: null };
  if (authority.issue) return <ProjectIssue issue={authority.issue}/>;
  return <div className={styles.content}><ProjectSettingsAdministration workspace={workspace.data} canChangeStatus={authority.data.canCreate && capabilities.canManageMembers}/></div>;
}
