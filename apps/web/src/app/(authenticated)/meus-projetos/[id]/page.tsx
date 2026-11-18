import { ProjectOverview } from "../../../../components/projects/project-workspace";
export const metadata = { title: "Visão geral do projeto" };
export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectOverview projectId={id}/>;
}
