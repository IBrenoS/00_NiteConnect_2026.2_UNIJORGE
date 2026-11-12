import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectLibrary,getProjectFolderTree,validUuid } from "../../../../../lib/documents/library";
import { getProjectTeam } from "../../../../../lib/projects/team";
import { getLeadershipProjects } from "../../../../../lib/projects/data";
import { LibraryExplorer } from "../../../../../components/documents/library-explorer";
export const dynamic="force-dynamic";
export const metadata={title:"Arquivos do projeto"};
type Props={params:Promise<{id:string}>;searchParams:Promise<{folder?:string}>};
export default async function ProjectDocumentsPage({params,searchParams}:Props) {
  const {id}=await params;if(!validUuid(id))notFound();
  const query=await searchParams;
  const session=await requireAuthenticatedNiteSession();
  const [files,leadership,team,tree]=await Promise.all([getProjectLibrary(session.bearer,id,query.folder&&validUuid(query.folder)?query.folder:undefined),getLeadershipProjects(session.bearer),getProjectTeam(session.bearer,id),getProjectFolderTree(session.bearer,id)]);
  if(files.issue==="not-found"||files.issue==="access")notFound();
  const canManage=session.roles.some(r=>r==="GESTOR_GERAL"||r==="COORDENADOR") || Boolean(leadership.data?.some(p=>p.projectId===id));
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-7 sm:px-8">
    <header><h1 className="font-display text-type-page-title text-nite-text-primary">Arquivos do projeto</h1>
    <p className="text-type-body-compact text-nite-text-secondary">Documentos compartilhados da equipe, independentes das pastas individuais.</p></header>
    {files.data?<LibraryExplorer listing={files.data} base={`/projetos/${id}/arquivos`} canManage={canManage} members={canManage?(team.data??[]):[]} tree={canManage?(tree.data??[]):[]}/>
      :<p role="alert" className="text-nite-text-secondary">Arquivos indisponíveis no momento.</p>}
  </main>;
}
