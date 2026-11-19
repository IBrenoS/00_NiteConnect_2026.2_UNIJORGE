import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../../lib/auth/server-session";
import { getProjectWorkspace } from "../../../../../../lib/projects/data";
import { getProjectTrashListing } from "../../../../../../lib/documents/library";
import { ProjectIssue } from "../../../../../../components/projects/project-ui";
import { TrashExplorer } from "../../../../../../components/documents/trash-explorer";
import styles from "../../../../../../components/projects/projects.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Lixeira do projeto"};
type Params={offset?:string;type?:string;sortBy?:string;direction?:string;error?:string;saved?:string};
export default async function ProjectTrashPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Params>}) {
 const {id}=await params;const session=await requireAuthenticatedNiteSession();
 const workspace=await getProjectWorkspace(session.bearer,id);
 if(workspace.issue==="not-found"||workspace.issue==="invalid")notFound();
 if(workspace.issue)return <ProjectIssue issue={workspace.issue}/>;
 if(!workspace.data.capabilities.canViewDocuments||!workspace.data.capabilities.canManageMembers)return <ProjectIssue issue="access"/>;
 const query=await searchParams;
 const offset=Number(query.offset??0);
 if(!Number.isSafeInteger(offset)||offset<0)return <ProjectIssue issue="invalid"/>;
 const listing=await getProjectTrashListing(session.bearer,id,{offset,limit:50,type:query.type,sortBy:query.sortBy,direction:query.direction});
 const base=`/meus-projetos/${id}/documentos`;
 return <div className={styles.sectionPage}><TrashExplorer key={JSON.stringify([id,query])} listing={listing.data} issue={listing.issue} params={query} projectContext={{id,name:workspace.data.name,basePath:`${base}/lixeira`,libraryPath:base,requestsPath:`${base}/aprovacoes`,canRequestActions:workspace.data.capabilities.canManageMembers}}/></div>;
}
