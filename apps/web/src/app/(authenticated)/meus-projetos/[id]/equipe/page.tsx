import { notFound } from "next/navigation";
import { ProjectTeam } from "../../../../../components/projects/project-team";
import { ProjectIssue } from "../../../../../components/projects/project-ui";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectWorkspace, getProjectTeam, getProjectRequests } from "../../../../../lib/projects/data";
export const metadata = { title: "Equipe do projeto" };
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
  if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
  if (!workspace.data.capabilities.canAccessWorkspace) return <ProjectIssue issue="access"/>;
  const members = await getProjectTeam(session.bearer, id);
  if (members.issue) return <ProjectIssue issue={members.issue}/>;
  const requests = workspace.data.capabilities.canDecideRequests ? await getProjectRequests(session.bearer, id) : { data: [], issue: null };
  return <ProjectTeam workspace={workspace.data} members={members.data} requests={requests.data ?? []} requestsIssue={requests.issue}/>;
}
