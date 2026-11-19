import { notFound } from "next/navigation";
import { ProjectOverview } from "../../../../components/projects/project-workspace";
import { ProjectIssue } from "../../../../components/projects/project-ui";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getProjectWorkspace, getProjectTeam } from "../../../../lib/projects/data";
import { getApiJson } from "../../../../lib/api/server";
import { parseActivityStatistics } from "../../../../lib/activities/contracts";
export const metadata = { title: "Visão geral do projeto" };
export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
  if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
  if (!workspace.data.capabilities.canAccessWorkspace) return <ProjectIssue issue="access"/>;
  const [members, statistics] = await Promise.all([getProjectTeam(session.bearer, id), workspace.data.capabilities.canViewActivities ? getApiJson(`/api/v1/projects/${encodeURIComponent(id)}/activity-stats`, session.bearer, parseActivityStatistics) : Promise.resolve({ data: null, issue: null })]);
  return <ProjectOverview workspace={workspace.data} members={members.data ?? []} teamIssue={members.issue} statistics={statistics.data} statsIssue={statistics.issue}/>;
}
