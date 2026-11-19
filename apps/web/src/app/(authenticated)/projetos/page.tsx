import { ProjectDirectory } from "../../../components/projects/project-directory";
import { ProjectIssue } from "../../../components/projects/project-ui";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getProjectAuthority, getAllProjectCatalog, getAllMyProjectIds, getMyProjectRequests, getMyProjectInterests } from "../../../lib/projects/data";
export const dynamic = "force-dynamic";
export const metadata = { title: "Projetos" };
export default async function ProjectsPage() {
  const session = await requireAuthenticatedNiteSession();
  const [catalog, own, requests, interests, authority] = await Promise.all([getAllProjectCatalog(session.bearer), getAllMyProjectIds(session.bearer), getMyProjectRequests(session.bearer), getMyProjectInterests(session.bearer), getProjectAuthority(session.bearer)]);
  if (catalog.issue) return <ProjectIssue issue={catalog.issue}/>;

  return <ProjectDirectory projects={catalog.data} ownProjectIds={own.data ?? []} requests={requests.data ?? []} interests={interests.data ?? []} participationIssue={own.issue ?? requests.issue ?? interests.issue ?? authority.issue} personal={false} canAdminister={authority.data?.canCreate ?? false} canCreate={authority.data?.canCreate ?? false}/>;
}
