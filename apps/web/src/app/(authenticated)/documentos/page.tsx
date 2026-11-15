import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getDocumentSearch,getFolderAncestors,getPersonalLibrary,getSharedFolder,getSharedListing,getSentListing,getTemplates,validUuid } from "../../../lib/documents/library";
import { MyFilesExplorer } from "../../../components/documents/my-files-explorer";
import { DocumentSearchResults } from "../../../components/documents/document-search-results";
export const dynamic="force-dynamic";
export const metadata={title:"Meus arquivos"};
type Props={searchParams:Promise<{folder?:string;view?:string;error?:string;saved?:string;uploaded?:string;advanced?:string;search?:string;type?:string;mimeType?:string;from?:string;to?:string;createdBy?:string;modifiedBy?:string;ownerKind?:string;ownerId?:string;origin?:string;shared?:string;permission?:string;sortBy?:string;cursor?:string;sort?:string;direction?:string}>};
export default async function PersonalDocumentsPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  const params=await searchParams;
  if(params.advanced==="1") {
    const dateTime=(value:string|undefined,end=false)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T${end?"23:59:59.999":"00:00:00.000"}Z`:undefined;
    const result=await getDocumentSearch(session.bearer,{search:params.search,type:params.type,mimeType:params.mimeType,modifiedFrom:dateTime(params.from),modifiedTo:dateTime(params.to,true),createdBy:params.createdBy,modifiedBy:params.modifiedBy,ownerKind:params.ownerKind,ownerId:params.ownerId,origin:params.origin,shared:params.shared,permission:params.permission,sortBy:params.sortBy,direction:params.direction,cursor:params.cursor,limit:50});
    return <DocumentSearchResults page={result.data} issue={result.issue} filters={params} memberId={session.member.id}/>;
  }
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
