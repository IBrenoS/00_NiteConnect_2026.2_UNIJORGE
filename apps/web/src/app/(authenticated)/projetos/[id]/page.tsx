import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getCatalogProject, getAllMyProjectIds, getMyProjectRequests, getProjectWorkspace, getProjectTeam } from "../../../../lib/projects/data";
import { ProjectPresentation } from "../../../../components/projects/project-presentation";
import { ProjectIssue } from "../../../../components/projects/project-ui";
export const dynamic = "force-dynamic";
export const metadata = { title: "Apresentação do projeto" };
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ dialog?: string }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const project = await getCatalogProject(session.bearer, id);
  if (project.issue === "not-found" || project.issue === "invalid") notFound();
  if (project.issue) return <ProjectIssue issue={project.issue}/>;
  if (!project.data.capabilities.canViewPresentation) return <ProjectIssue issue="access"/>;
  const canReadWorkspace = project.data.capabilities.canAccessWorkspace || project.data.capabilities.canManageMembers || project.data.capabilities.canDecideRequests || project.data.capabilities.canEditProject || project.data.capabilities.canDeleteProject || project.data.capabilities.canManageAvailability;
  const [own, requests, workspace, members] = await Promise.all([
    getAllMyProjectIds(session.bearer),
    getMyProjectRequests(session.bearer),
    canReadWorkspace ? getProjectWorkspace(session.bearer, id) : Promise.resolve({ data: null, issue: null }),
    project.data.capabilities.canAccessWorkspace || project.data.capabilities.canManageMembers || project.data.capabilities.canDecideRequests ? getProjectTeam(session.bearer, id) : Promise.resolve({ data: [], issue: null }),
  ]);
  const query: { dialog?: string } = await (searchParams ?? Promise.resolve({ dialog: undefined }));
  const canOpenEdit = query.dialog === "edit" && project.data.capabilities.canEditProject && workspace.data !== null;
  return <ProjectPresentation project={project.data} participates={own.data?.includes(id) ?? false} requests={requests.data?.filter(request => request.projectId === id) ?? []} participationIssue={own.issue ?? requests.issue} workspace={workspace.data} members={members.data ?? []} memberIssue={members.issue} editOpen={canOpenEdit}/>;
}
