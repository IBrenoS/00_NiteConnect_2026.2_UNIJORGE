import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getCatalogProject, getAllMyProjectIds, getMyProjectRequests, getMyProjectInterests } from "../../../../lib/projects/data";
import { ProjectPresentation } from "../../../../components/projects/project-presentation";
import { ProjectIssue } from "../../../../components/projects/project-ui";
export const dynamic = "force-dynamic";
export const metadata = { title: "Apresentação do projeto" };
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const project = await getCatalogProject(session.bearer, id);
  if (project.issue === "not-found" || project.issue === "invalid") notFound();
  if (project.issue) return <ProjectIssue issue={project.issue}/>;
  if (!project.data.capabilities.canViewPresentation) return <ProjectIssue issue="access"/>;
  const [own, requests, interests] = await Promise.all([getAllMyProjectIds(session.bearer), getMyProjectRequests(session.bearer), getMyProjectInterests(session.bearer)]);
  return <ProjectPresentation project={project.data} participates={own.data?.includes(id) ?? false} requests={requests.data?.filter(request => request.projectId === id) ?? []} interests={interests.data?.filter(interest => interest.projectId === id) ?? []} participationIssue={own.issue ?? requests.issue ?? interests.issue}/>;
}
