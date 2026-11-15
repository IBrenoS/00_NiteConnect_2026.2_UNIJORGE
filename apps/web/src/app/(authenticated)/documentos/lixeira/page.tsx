import { requireAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { getTrashListing } from "../../../../lib/documents/library";
import { TrashExplorer } from "../../../../components/documents/trash-explorer";

export const dynamic="force-dynamic";
export const metadata={title:"Lixeira"};
type Props={searchParams:Promise<{offset?:string;type?:string;sortBy?:string;direction?:string;error?:string;saved?:string}>};
export default async function TrashPage({searchParams}:Props) {
  const session=await requireAuthenticatedNiteSession();
  const params=await searchParams;
  const offset=Math.max(0,Number.isSafeInteger(Number(params.offset))?Number(params.offset??0):0);
  const listing=await getTrashListing(session.bearer,{offset,type:params.type,sortBy:params.sortBy,direction:params.direction});
  return <TrashExplorer key={`${offset}:${params.type??""}:${params.sortBy??""}:${params.direction??""}:${params.saved??""}`} listing={listing.data} issue={listing.issue} params={params}/>;
}
