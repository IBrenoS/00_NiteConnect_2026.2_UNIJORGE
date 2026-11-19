import { notFound } from "next/navigation";
import { ProjectDocuments, type ProjectDocumentParams } from "../../../../../components/projects/project-documents";
import { ProjectIssue } from "../../../../../components/projects/project-ui";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectWorkspace } from "../../../../../lib/projects/data";
import { getProjectLibrary,getProjectFolderAncestors,validUuid } from "../../../../../lib/documents/library";
export const dynamic="force-dynamic";
export const metadata = { title: "Documentos do projeto" };
export default async function ProjectDocumentsPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<ProjectDocumentParams> }) {
 const {id}=await params;
 const session=await requireAuthenticatedNiteSession();
 const workspace=await getProjectWorkspace(session.bearer,id);
 if(workspace.issue==="not-found"||workspace.issue==="invalid")notFound();
 if(workspace.issue)return <ProjectIssue issue={workspace.issue}/>;
 if(!workspace.data.capabilities.canViewDocuments)return <ProjectIssue issue="access"/>;
 const query=await searchParams;
 if(query.folder&&!validUuid(query.folder))return <ProjectIssue issue="invalid"/>;
 const listing=await getProjectLibrary(session.bearer,id,query.folder,{search:query.search,mimeType:query.type,sortBy:query.sort,direction:query.direction,limit:100});
 if(listing.issue==="not-found")notFound();
 if(listing.issue)return <ProjectIssue issue={listing.issue}/>;
 const ancestors=await getProjectFolderAncestors(session.bearer,id,listing.data.folder);
 if(ancestors.issue)return <ProjectIssue issue={ancestors.issue}/>;
 return <ProjectDocuments projectId={id} name={workspace.data.name} listing={listing.data} ancestors={ancestors.data} memberId={session.member.id} canManage={workspace.data.capabilities.canManageMembers} params={query}/>;
}
