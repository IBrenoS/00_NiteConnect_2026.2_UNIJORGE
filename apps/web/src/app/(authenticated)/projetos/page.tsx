import { ProjectDirectory } from "../../../components/projects/project-directory";
import { ProjectIssue } from "../../../components/projects/project-ui";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getProjectAuthority, getAllProjectCatalog, getAllMyProjectIds, getMyProjectRequests, getMyProjectInterests } from "../../../lib/projects/data";
import { getProjectRequestHistory } from "../../../lib/projects/data";
export const dynamic = "force-dynamic";
export const metadata = { title: "Projetos" };
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const session = await requireAuthenticatedNiteSession();
  const [catalog, own, requests, interests, authority] = await Promise.all([getAllProjectCatalog(session.bearer), getAllMyProjectIds(session.bearer), getMyProjectRequests(session.bearer), getMyProjectInterests(session.bearer), getProjectAuthority(session.bearer)]);
  if (catalog.issue) return <ProjectIssue issue={catalog.issue}/>;
  const ended=(requests.data ?? []).filter(request=>request.state==="ENCERRADA");
  const histories=await Promise.all(ended.map(request=>getProjectRequestHistory(session.bearer,request.projectId,request.id)));
  const requestEvents=histories.flatMap(result=>result.data??[]);
  const requestHistoryIssue=histories.find(result=>result.issue)?.issue??null;
  return <ProjectDirectory projects={catalog.data} ownProjectIds={own.data ?? []} requests={requests.data ?? []} interests={interests.data ?? []} requestEvents={requestEvents} requestHistoryIssue={requestHistoryIssue} participationIssue={own.issue ?? requests.issue ?? interests.issue ?? authority.issue} personal={false} initialTab={tab === "requests" ? "requests" : "all"} canAdminister={authority.data?.canCreate ?? false} canCreate={authority.data?.canCreate ?? false}/>;
}
