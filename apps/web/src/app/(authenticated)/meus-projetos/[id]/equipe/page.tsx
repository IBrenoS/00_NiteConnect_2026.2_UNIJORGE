import { ProjectTeam } from "../../../../../components/projects/project-team";
export const metadata = { title: "Equipe do projeto" };
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectTeam projectId={id}/>;
}
