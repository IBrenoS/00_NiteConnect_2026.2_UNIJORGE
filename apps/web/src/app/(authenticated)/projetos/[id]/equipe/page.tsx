import { notFound } from "next/navigation";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getProjectWorkspace, getProjectTeam, getProjectRequests, getProjectCandidates } from "../../../../../lib/projects/data";
import { ProjectTeamAdministration } from "../../../../../components/projects/project-administration-contexts";
import { ProjectIssue } from "../../../../../components/projects/project-ui";
import styles from "../../../../../components/projects/project-administration-layout.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipe do projeto" };

export default async function ProjectTeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ integrante?: string | string[] }> }) {
  const { id } = await params;
  const session = await requireAuthenticatedNiteSession();
  const workspace = await getProjectWorkspace(session.bearer, id);
  if (workspace.issue === "not-found" || workspace.issue === "invalid") notFound();
  if (workspace.issue) return <ProjectIssue issue={workspace.issue}/>;
  const capabilities = workspace.data.capabilities;
  if (!capabilities.canAccessWorkspace && !capabilities.canManageMembers && !capabilities.canDecideRequests && !capabilities.canTransferLeadership) return <ProjectIssue issue="access"/>;

  const requested = (await searchParams).integrante;
  const candidateSearch = typeof requested === "string" ? requested.trim() : "";
  const validSearch = candidateSearch.length >= 2 && candidateSearch.length <= 160;
  const [members, requests, candidates] = await Promise.all([
    getProjectTeam(session.bearer, id),
    capabilities.canDecideRequests ? getProjectRequests(session.bearer, id) : Promise.resolve({ data: [], issue: null }),
    capabilities.canManageMembers && validSearch ? getProjectCandidates(session.bearer, id, candidateSearch) : Promise.resolve({ data: [], issue: candidateSearch && capabilities.canManageMembers ? "invalid" : null }),
  ]);

  return <div className={styles.content}><ProjectTeamAdministration workspace={workspace.data} members={members.data ?? []} requests={requests.data ?? []} candidates={candidates.data ?? []} candidateSearch={candidateSearch} membersIssue={members.issue} requestsIssue={requests.issue} candidatesIssue={candidates.issue}/></div>;
}
