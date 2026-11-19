import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectWorkspace, getProjectAuthority, getProjectTeam, getProjectCandidates, getProjectStatusHistory, getProjectParticipationHistory, getProjectLeadershipHistory } from "../../../../../lib/projects/data";
import { ProjectAdministration } from "../../../../../components/projects/project-administration";
import { ProjectIssue } from "../../../../../components/projects/project-ui";
export const metadata = { title: "Administrar projeto" };
export default async function AdministerProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ integrante?: string | string[] }> }) {
 const { id } = await params;
 const session = await requireAuthenticatedNiteSession();
 const workspace = await getProjectWorkspace(session.bearer,id);
 if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
 if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
 if (!workspace.data.capabilities.canManageMembers) return <ProjectIssue issue="access"/>;
 const requested = (await searchParams)?.integrante;
 const candidateSearch = typeof requested === "string" ? requested.trim() : "";
 const validSearch = candidateSearch.length >= 2 && candidateSearch.length <= 160;
 const [authority,members,candidates,statuses,participations,leadership] = await Promise.all([getProjectAuthority(session.bearer),getProjectTeam(session.bearer,id),validSearch ? getProjectCandidates(session.bearer,id,candidateSearch) : Promise.resolve({ data: [], issue: candidateSearch ? "invalid" : null }),getProjectStatusHistory(session.bearer,id),getProjectParticipationHistory(session.bearer,id),getProjectLeadershipHistory(session.bearer,id)]);
 return <ProjectAdministration candidateSearch={candidateSearch} workspace={workspace.data} canChangeStatus={authority.data?.canCreate ?? false} members={members.data ?? []} candidates={candidates.data ?? []} statusHistory={statuses.data ?? []} participationHistory={participations.data ?? []} leadershipHistory={leadership.data ?? []} issues={[...new Set([authority.issue,members.issue,candidates.issue,statuses.issue,participations.issue,leadership.issue].filter((v): v is NonNullable<typeof v> => v !== null))]}/>;
}
