import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getLeadershipProjects } from "../../../../lib/projects/data";
import { getAllProjects } from "../../../../lib/activities/data";
import { ActivityPlanningForm } from "../../../../components/activities/activity-planning-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova atividade" };

export default async function NewActivityPage() {
  const session = await requireAuthenticatedNiteSession();
  const isAdministrator = session.roles.includes("COORDENADOR") || session.roles.includes("GESTOR_GERAL");
  const result = isAdministrator ? await getAllProjects(session.bearer) : await getLeadershipProjects(session.bearer);
  const projects = result.data ?? [];
  const options = projects.map((project) => "projectId" in project
    ? ({ id: project.projectId, title: project.title })
    : ({ id: project.id, title: project.title }));
  return <main className="mx-auto w-full max-w-[1600px] min-w-0 px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
    <ActivityPlanningForm projects={options}/>
    {result.issue ? <p role="status" className="mx-auto mt-3 max-w-[680px] text-type-metadata text-nite-text-muted">A consulta de projetos autorizados está indisponível; é possível criar uma atividade independente.</p> : null}
  </main>;
}
