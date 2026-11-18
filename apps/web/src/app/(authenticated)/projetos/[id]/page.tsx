import { notFound } from "next/navigation";
import { visualCatalog } from "../../../../lib/projects/visual-data";
import { ProjectPresentation } from "../../../../components/projects/project-presentation";
export const metadata = { title: "Apresentação do projeto" };
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!visualCatalog.some(p => p.id === id)) notFound();
  return <ProjectPresentation projectId={id}/>;
}
