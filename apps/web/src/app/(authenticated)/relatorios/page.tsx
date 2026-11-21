import {requireAuthenticatedNiteSession} from "../../../lib/auth/server-session";
import {getRecipients} from "../../../lib/documents/library";
import {ReportsDirectory,ReportsIssue} from "../../../components/reports/reports-browser";
export const dynamic="force-dynamic";
export const metadata={title:"Relatórios"};
export default async function ReportsPage({searchParams}:{searchParams:Promise<{search?:string|string[]}>}) {
  const session=await requireAuthenticatedNiteSession();
  // Directory permission is checked live by the backend, including role revocation.
  const result=await getRecipients(session.bearer);
  const input=(await searchParams).search;
  const search=typeof input==="string"?input.slice(0,120):"";
  return <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-8">{result.data?<ReportsDirectory members={result.data} search={search}/>:<ReportsIssue issue={result.issue}/>}</main>;
}
