import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../../lib/auth/server-session";
import { getProjectWorkspace, getProjectAuthority } from "../../../../../../lib/projects/data";
import { getProjectDocumentRequests, getProjectDocumentRequest } from "../../../../../../lib/projects/document-requests";
import { validUuid } from "../../../../../../lib/documents/library-contracts";
import { ProjectIssue } from "../../../../../../components/projects/project-ui";
import { ProjectDocumentRequests } from "../../../../../../components/projects/project-document-requests";
import styles from "../../../../../../components/projects/projects.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solicitações documentais do projeto" };

export default async function ProjectDocumentRequestsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ request?: string }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
  if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
  if (!workspace.data.capabilities.canViewDocuments || !workspace.data.capabilities.canManageMembers) return <ProjectIssue issue="access"/>;
  const authority = await getProjectAuthority(session.bearer);
  if (authority.issue) return <ProjectIssue issue={authority.issue}/>;
  const query = await searchParams;
  if (query.request && !validUuid(query.request)) return <ProjectIssue issue="invalid"/>;
  const [pending, current] = await Promise.all([
    authority.data.canCreate ? getProjectDocumentRequests(session.bearer, id) : Promise.resolve({ data: [], issue: null }),
    query.request ? getProjectDocumentRequest(session.bearer, id, query.request) : Promise.resolve({ data: null, issue: null }),
  ]);
  const requests = [...new Map([...(current.data ? [current.data] : []), ...(pending.data ?? [])].map(request => [request.id, request])).values()];
  return <div className={styles.sectionPage}><ProjectDocumentRequests projectId={id} requests={requests} issue={current.issue ?? pending.issue} canDecide={authority.data.canCreate}/></div>;
}
