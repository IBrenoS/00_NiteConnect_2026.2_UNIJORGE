import { ProjectDirectory } from "../../../components/projects/project-directory";
import { ProjectIssue } from "../../../components/projects/project-ui";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getLeadershipProjects, getAllProjectCatalog, getAllMyProjectIds, getMyProjectRequests, getMyProjectInterests } from "../../../lib/projects/data";
export const dynamic = "force-dynamic";
export const metadata = { title: "Meus projetos" };
export default async function ProjectsPage() {
  const session = await requireAuthenticatedNiteSession();
  const [catalog, own, requests, interests, leadership] = await Promise.all([getAllProjectCatalog(session.bearer), getAllMyProjectIds(session.bearer), getMyProjectRequests(session.bearer), getMyProjectInterests(session.bearer), getLeadershipProjects(session.bearer)]);
  if (catalog.issue) return <ProjectIssue issue={catalog.issue}/>;
  if (own.issue) return <ProjectIssue issue={own.issue}/>;
  return <ProjectDirectory projects={catalog.data} ownProjectIds={own.data ?? []} leadershipProjectIds={leadership.data?.map(project => project.projectId) ?? []} requests={requests.data ?? []} interests={interests.data ?? []} participationIssue={own.issue ?? requests.issue ?? interests.issue} personal={true} canAdminister={session.roles.some(role => role === "COORDENADOR" || role === "GESTOR_GERAL")}/>;
}
