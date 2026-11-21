import {notFound} from "next/navigation";
import {requireAuthenticatedNiteSession} from "../../../../lib/auth/server-session";
import {getRecipients,validUuid} from "../../../../lib/documents/library";
import {getReports} from "../../../../lib/reports/data";
import {ReportsDocuments,ReportsIssue} from "../../../../components/reports/reports-browser";
export const dynamic="force-dynamic";
export const metadata={title:"Relatórios do integrante"};
export default async function MemberReportsPage({params,searchParams}:{params:Promise<{memberId:string}>;searchParams:Promise<{folder?:string;offset?:string}>}) {
  const session=await requireAuthenticatedNiteSession();
  const {memberId}=await params,query=await searchParams;
  if(!validUuid(memberId)||(query.folder&&!validUuid(query.folder))||(query.offset!==undefined&&!/^\d{1,7}$/.test(query.offset)))notFound();
  const directory=await getRecipients(session.bearer);
  if(!directory.data)return <main className="p-4 sm:p-8"><ReportsIssue issue={directory.issue}/></main>;
  const member=directory.data.find(item=>item.id===memberId);
  if(!member)notFound();
  const listing=await getReports(session.bearer,memberId,query.folder,Number(query.offset??0));
  if(listing.issue==="not-found")notFound();
  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-8">{listing.data?<ReportsDocuments member={member} listing={listing.data} folder={query.folder}/>:<ReportsIssue issue={listing.issue}/>}</main>;
}
