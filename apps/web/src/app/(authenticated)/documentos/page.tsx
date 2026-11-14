import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getFolderAncestors,getPersonalLibrary,getSharedFolder,getSharedListing,getTemplates,validUuid } from "../../../lib/documents/library";
import { MyFilesExplorer } from "../../../components/documents/my-files-explorer";
export const dynamic="force-dynamic";
export const metadata={title:"Meus arquivos"};
type Props={searchParams:Promise<{folder?:string;view?:string;error?:string;saved?:string;uploaded?:string;search?:string;type?:string;sort?:string;direction?:string}>};
export default async function PersonalDocumentsPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  const params=await searchParams;
  const canArchivePersonal=session.roles.some((role)=>role==="COORDENADOR"||role==="GESTOR_GERAL");
  const shared=params.view==="shared";
  const options={search:params.search,mimeType:params.type,sortBy:params.sort,direction:params.direction,limit:100};
  if(shared&&!params.folder) {
    const received=await getSharedListing(session.bearer,options);
    return <MyFilesExplorer key={`shared:${params.search??""}:${params.type??""}`} listing={null} sharedItems={received.data?.items??[]} hasMore={received.data?.hasMore??false} nextCursor={received.data?.nextCursor??null} issue={received.issue} view="shared" canArchivePersonal={false} templates={[]} params={params}/>;
  }
  const folder=params.folder&&validUuid(params.folder)?params.folder:undefined;
  const [listing,templates]=await Promise.all([shared?getSharedFolder(session.bearer,folder??"",options):getPersonalLibrary(session.bearer,folder,options),shared?Promise.resolve(null):getTemplates(session.bearer)]);
  const ancestors=listing.data?await getFolderAncestors(session.bearer,listing.data.folder):[];
  return <MyFilesExplorer key={`${shared?"shared":"personal"}:${folder??"root"}:${params.search??""}:${params.type??""}:${params.sort??""}:${params.direction??""}`} listing={listing.data} ancestors={ancestors} issue={listing.issue} view={shared?"shared":"personal"} canArchivePersonal={!shared&&canArchivePersonal} templates={templates?.data?.filter((template)=>!template.retired)??[]} params={params}/>;
}
