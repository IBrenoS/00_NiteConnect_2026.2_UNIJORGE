import { ProjectDocuments } from "../../../../../components/projects/project-documents";
export const metadata = { title: "Documentos do projeto" };
export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDocuments projectId={id}/>;
}
