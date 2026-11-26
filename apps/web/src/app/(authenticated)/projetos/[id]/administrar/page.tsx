import { notFound } from "next/navigation";
import { validUuid } from "../../../../../lib/documents/library-contracts";
import { ProjectAdministrationLegacyRedirect } from "../../../../../components/projects/project-administration-legacy-redirect";

export const metadata = { title: "Administração do projeto" };

export default async function AdministerProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validUuid(id)) notFound();
  return <ProjectAdministrationLegacyRedirect projectId={id}/>;
}
