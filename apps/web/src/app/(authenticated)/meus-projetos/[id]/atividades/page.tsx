import { ProjectActivities } from "../../../../../components/projects/project-activities";
export const metadata = { title: "Atividades e planejamento do projeto" };
export default async function ProjectActivitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectActivities projectId={id}/>;
}
