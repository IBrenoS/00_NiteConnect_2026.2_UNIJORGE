import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { redirect } from "next/navigation";
import { getFolderAncestors,getPersonalLibrary,getSharedFolder,getSharedListing,getSentListing,getTemplates,validUuid } from "../../../lib/documents/library";
import { MyFilesExplorer } from "../../../components/documents/my-files-explorer";
export const dynamic="force-dynamic";
export const metadata={title:"Meus arquivos"};
type Props={searchParams:Promise<{folder?:string;view?:string;error?:string;saved?:string;uploaded?:string;advanced?:string;search?:string;type?:string;sort?:string;direction?:string}>};
export default async function PersonalDocumentsPage({searchParams}:Props) {
  const params=await searchParams;
  if(params.advanced==="1") redirect("/documentos");
  const session=await requireAuthenticatedNiteSession();
  const canArchivePersonal=session.roles.some((role)=>role==="COORDENADOR"||role==="GESTOR_GERAL");
  const shared=params.view==="shared",sent=params.view==="sent",sharedPerspective=shared||sent;
  const options={search:params.search,mimeType:params.type,sortBy:params.sort,direction:params.direction,limit:100};
  if(shared&&!params.folder) {
    const received=await getSharedListing(session.bearer,options);
    return <MyFilesExplorer key={`shared:${params.search??""}:${params.type??""}:${params.saved??""}`} listing={null} sharedItems={received.data?.items??[]} hasMore={received.data?.hasMore??false} nextCursor={received.data?.nextCursor??null} issue={received.issue} view="shared" memberId={session.member.id} canArchivePersonal={false} templates={[]} params={params}/>;
  }
  if(sent&&!params.folder) {
    const sentItems=await getSentListing(session.bearer,options);
    return <MyFilesExplorer key={`sent:${params.search??""}:${params.saved??""}`} listing={null} sentItems={sentItems.data?.items??[]} hasMore={sentItems.data?.hasMore??false} nextCursor={sentItems.data?.nextCursor??null} issue={sentItems.issue} view="sent" memberId={session.member.id} templates={[]} params={params}/>;
  }
  const folder=params.folder&&validUuid(params.folder)?params.folder:undefined;
  const [listing,templates]=await Promise.all([sharedPerspective?getSharedFolder(session.bearer,folder??"",options):getPersonalLibrary(session.bearer,folder,options),sharedPerspective?Promise.resolve(null):getTemplates(session.bearer)]);
  const ancestors=listing.data?await getFolderAncestors(session.bearer,listing.data.folder):[];
  return <MyFilesExplorer key={`${shared?"shared":sent?"sent":"personal"}:${folder??"root"}:${params.search??""}:${params.type??""}:${params.sort??""}:${params.direction??""}:${params.saved??""}`} listing={listing.data} ancestors={ancestors} issue={listing.issue} view={shared?"shared":sent?"sent":"personal"} memberId={session.member.id} canArchivePersonal={!sharedPerspective&&canArchivePersonal} templates={templates?.data?.filter((template)=>!template.retired)??[]} params={params}/>;
}
