"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { mutateActivity } from "../activities/mutations";
import { getProjectAuthority, getProjectWorkspace } from "./data";
import { parseProjectDetails, validProjectDate, isProjectStatus, type ProjectDetails, type ProjectFields } from "./administration-contracts";
import { projectIdPattern, type ProjectStatus } from "./integration-contracts";
import type { ProjectActionResult, ProjectMutationIssue } from "./actions";

function fail<T = null>(issue: ProjectMutationIssue): ProjectActionResult<T> {
 const messages: Record<ProjectMutationIssue,string> = { access: "Você não tem permissão para realizar esta ação.", unauthenticated: "Sua sessão expirou. Entre novamente.", invalid: "Confira os campos, os limites de texto e o período informado.", conflict: "Os dados mudaram ou a operação não está disponível. Atualize a página antes de tentar novamente.", "not-found": "Projeto ou integrante indisponível.", unavailable: "Não foi possível concluir a ação. Tente novamente." };
 return { data: null, issue, issueText: messages[issue] };
}
function text(v: unknown, max: number): v is string { return typeof v === "string" && v.trim().length > 0 && v.length <= max; }
function version(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function fields(v: ProjectFields): boolean { return !!v && text(v.title,200) && text(v.description,10000) && text(v.reason,1000) && validProjectDate(v.startsOn) && validProjectDate(v.endsOn) && !(v.startsOn && v.endsOn && v.startsOn > v.endsOn); }
function clean(v: ProjectFields): ProjectFields { return { title: v.title.trim(), description: v.description.trim(), startsOn: v.startsOn, endsOn: v.endsOn, reason: v.reason.trim() }; }
function refresh(id: string) {
 revalidatePath("/projetos"); revalidatePath(`/projetos/${id}`, "layout"); revalidatePath("/meus-projetos"); revalidatePath(`/meus-projetos/${id}`, "layout");
}
async function send<T = null>(bearer: string, path: string, method: "POST" | "PATCH" | "DELETE", body: unknown, id?: string, parse?: (value: unknown) => T | null): Promise<ProjectActionResult<T>> {
 const result = await mutateActivity(path, bearer, method, body, parse);
 if (result.issue) return fail(result.issue === "too-large" || result.issue === "unsupported" ? "invalid" : result.issue === "project-paused" ? "conflict" : result.issue);
 if (parse && !result.data) return fail("invalid");
 if (id) refresh(id); else if (result.data && typeof result.data === "object" && "id" in result.data && typeof result.data.id === "string") refresh(result.data.id);
 return { data: result.data, issue: null, issueText: null };
}
async function context(bearer: string, id: string, expectedVersion: number, capability: "canManageMembers" | "canTransferLeadership") {
 const current = await getProjectWorkspace(bearer,id);
 if (current.issue) return current.issue;
 if (!current.data.capabilities[capability]) return "access";
 return current.data.version !== expectedVersion ? "conflict" : null;
}
export async function createProjectAction(input: ProjectFields): Promise<ProjectActionResult<ProjectDetails>> {
 const session = await requireAuthenticatedNiteSession();
 if (!fields(input)) return fail("invalid");
 const authority = await getProjectAuthority(session.bearer);
 if (authority.issue) return fail(authority.issue);
 if (!authority.data.canCreate) return fail("access");
 return send(session.bearer,"/api/v1/projects","POST",clean(input),undefined,parseProjectDetails);
}
export async function updateProjectAction(id: string, input: ProjectFields & { expectedVersion: number }): Promise<ProjectActionResult<ProjectDetails>> {
 const session = await requireAuthenticatedNiteSession();
 if (!projectIdPattern.test(id) || !fields(input) || !version(input.expectedVersion)) return fail("invalid");
 const issue = await context(session.bearer,id,input.expectedVersion,"canManageMembers"); if (issue) return fail(issue);
 return send(session.bearer,`/api/v1/projects/${id}`,"PATCH",{ ...clean(input), expectedVersion: input.expectedVersion },id,parseProjectDetails);
}
export async function changeProjectStatusAction(id: string, input: { status: ProjectStatus; expectedVersion: number; reason: string }): Promise<ProjectActionResult<ProjectDetails>> {
 const session = await requireAuthenticatedNiteSession();
 if (!projectIdPattern.test(id) || !input || !isProjectStatus(input.status) || !version(input.expectedVersion) || !text(input.reason,1000)) return fail("invalid");
 const authority = await getProjectAuthority(session.bearer); if (authority.issue) return fail(authority.issue); if (!authority.data.canCreate) return fail("access");
 const issue = await context(session.bearer,id,input.expectedVersion,"canManageMembers"); if (issue) return fail(issue);
 return send(session.bearer,`/api/v1/projects/${id}/status`,"PATCH",{ status: input.status, expectedVersion: input.expectedVersion, reason: input.reason.trim() },id,parseProjectDetails);
}
export async function transferProjectLeadershipAction(id: string, input: { memberId: string | null; expectedVersion: number; reason: string }): Promise<ProjectActionResult> {
 const session = await requireAuthenticatedNiteSession();
 if (!projectIdPattern.test(id) || !input || !(input.memberId === null || projectIdPattern.test(input.memberId)) || !version(input.expectedVersion) || !text(input.reason,1000)) return fail("invalid");
 const issue = await context(session.bearer,id,input.expectedVersion,"canTransferLeadership"); if (issue) return fail(issue);
 return send(session.bearer,`/api/v1/projects/${id}/leadership-transfers`,"POST",{ memberId: input.memberId, expectedVersion: input.expectedVersion, reason: input.reason.trim() },id);
}
export async function manageProjectMemberAction(id: string, input: { operation: "join" | "end"; memberId: string; responsibility?: string; expectedVersion: number; reason: string }): Promise<ProjectActionResult> {
 const session = await requireAuthenticatedNiteSession();
 if (!projectIdPattern.test(id) || !input || !["join","end"].includes(input.operation) || !projectIdPattern.test(input.memberId) || !version(input.expectedVersion) || !text(input.reason,1000) || (input.operation === "join" && !text(input.responsibility,200))) return fail("invalid");
 const issue = await context(session.bearer,id,input.expectedVersion,"canManageMembers"); if (issue) return fail(issue);
 return send(session.bearer,`/api/v1/projects/${id}/members${input.operation === "end" ? `/${input.memberId}` : ""}`,input.operation === "end" ? "DELETE" : "POST",{ expectedVersion: input.expectedVersion, reason: input.reason.trim(), ...(input.operation === "join" ? { memberId: input.memberId, responsibility: input.responsibility?.trim() } : {}) },id);
}
