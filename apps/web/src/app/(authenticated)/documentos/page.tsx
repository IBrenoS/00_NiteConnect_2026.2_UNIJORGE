import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getPersonalLibrary,getSharedFolder,getSharedListing,getTemplates,validUuid } from "../../../lib/documents/library";
import { MyFilesExplorer } from "../../../components/documents/my-files-explorer";
export const dynamic="force-dynamic";
export const metadata={title:"Meus arquivos"};
type Props={searchParams:Promise<{folder?:string;view?:string;permission?:string;error?:string;saved?:string;uploaded?:string;search?:string;type?:string;sort?:string;direction?:string}>};
export default async function PersonalDocumentsPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  const params=await searchParams;
  const shared=params.view==="shared";
  const options={search:params.search,mimeType:params.type,sortBy:params.sort,direction:params.direction,limit:100};
  if(shared&&!params.folder) {
    const received=await getSharedListing(session.bearer);
    return <MyFilesExplorer key={`shared:${params.search??""}:${params.type??""}`} listing={null} sharedItems={received.data?.items??[]} hasMore={received.data?.hasMore??false} nextCursor={received.data?.nextCursor??null} issue={received.issue} view="shared" templates={[]} params={params}/>;
  }
  const folder=params.folder&&validUuid(params.folder)?params.folder:undefined;
  if(shared&&!folder) {
    const received=await getSharedListing(session.bearer);
    return <MyFilesExplorer key={`shared-root:${params.search??""}:${params.type??""}`} listing={null} sharedItems={received.data?.items??[]} hasMore={received.data?.hasMore??false} nextCursor={received.data?.nextCursor??null} issue={received.issue} view="shared" templates={[]} params={params}/>;
  }
  const [listing,templates]=await Promise.all([shared?getSharedFolder(session.bearer,folder??"",options):getPersonalLibrary(session.bearer,folder,options),shared?Promise.resolve(null):getTemplates(session.bearer)]);
  return <MyFilesExplorer key={`${shared?"shared":"personal"}:${folder??"root"}:${params.search??""}:${params.type??""}:${params.sort??""}:${params.direction??""}`} listing={listing.data} issue={listing.issue} view={shared?"shared":"personal"} templates={templates?.data?.filter((template)=>!template.retired)??[]} params={params}/>;
}
