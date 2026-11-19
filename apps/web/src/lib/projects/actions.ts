"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { mutateActivity } from "../activities/mutations";
import type { ApiIssue } from "../api/contracts";
import { getCatalogProject, getProjectWorkspace } from "./data";
import { parseInterestSignal, parseMembershipRequest, projectIdPattern, type InterestSignal, type MembershipRequest } from "./integration-contracts";

export type ProjectMutationIssue = ApiIssue | "conflict";
export type ProjectActionResult<T = null> = { data: T | null; issue: ProjectMutationIssue | null; issueText: string | null };
const issueMessages: Record<ProjectMutationIssue, string> = {
  unauthenticated: "Sua sessão expirou. Entre novamente.",
  access: "Você não tem permissão para realizar esta ação.",
  "not-found": "Projeto ou solicitação indisponível.",
  unavailable: "Não foi possível concluir a ação. Tente novamente.",
  invalid: "Não foi possível validar os dados da ação.",
  conflict: "Os dados foram alterados ou esta ação não está mais disponível. Atualize a página.",
};
function failure<T = null>(issue: ProjectMutationIssue): ProjectActionResult<T> { return { data: null, issue, issueText: issueMessages[issue] }; }
function version(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function validMessage(value: unknown): value is string | null | undefined { return value === undefined || value === null || (typeof value === "string" && value.trim().length <= 2000); }
function refresh(id: string) {
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${id}`);
  revalidatePath("/meus-projetos");
  revalidatePath(`/meus-projetos/${id}`, "layout");
}
async function mutate<T>(id: string, bearer: string, suffix: string, method: "POST" | "PATCH", body: unknown, parse?: (v: unknown) => T | null): Promise<ProjectActionResult<T>> {
  const result = await mutateActivity(`/api/v1/projects/${encodeURIComponent(id)}/${suffix}`, bearer, method, body, parse);
  if (result.issue) return failure(result.issue === "unsupported" || result.issue === "too-large" ? "invalid" : result.issue);
  if (parse && result.data === null) return failure("invalid");
  refresh(id);
  return { data: result.data, issue: null, issueText: null };
}

export async function requestProjectMembershipAction(projectId: string, message?: string | null): Promise<ProjectActionResult<MembershipRequest>> {
  const session = await requireAuthenticatedNiteSession();
  if (!projectIdPattern.test(projectId) || !validMessage(message)) return failure("invalid");
  const current = await getCatalogProject(session.bearer, projectId);
  if (current.issue) return failure(current.issue);
  if (!current.data.capabilities.canRequestMembership) return failure("access");
  return mutate(projectId, session.bearer, "membership-requests", "POST", { message: message?.trim() || null }, parseMembershipRequest);
}

export async function expressProjectInterestAction(projectId: string, message?: string | null): Promise<ProjectActionResult<InterestSignal>> {
  const session = await requireAuthenticatedNiteSession();
  if (!projectIdPattern.test(projectId) || !validMessage(message)) return failure("invalid");
  const current = await getCatalogProject(session.bearer, projectId);
  if (current.issue) return failure(current.issue);
  if (!current.data.capabilities.canExpressInterest) return failure("access");
  return mutate(projectId, session.bearer, "interest-signals", "POST", { message: message?.trim() || null }, parseInterestSignal);
}

export async function decideProjectMembershipAction(projectId: string, requestId: string, input: { approve: boolean; message?: string | null; expectedVersion: number }): Promise<ProjectActionResult<MembershipRequest>> {
  const session = await requireAuthenticatedNiteSession();
  if (!projectIdPattern.test(projectId) || !projectIdPattern.test(requestId) || !input || typeof input.approve !== "boolean" || !version(input.expectedVersion) || !validMessage(input.message)) return failure("invalid");
  const current = await getProjectWorkspace(session.bearer, projectId);
  if (current.issue) return failure(current.issue);
  if (!current.data.capabilities.canDecideRequests) return failure("access");
  return mutate(projectId, session.bearer, `membership-requests/${encodeURIComponent(requestId)}/decision`, "POST", { approve: input.approve, message: input.message?.trim() || null, expectedVersion: input.expectedVersion }, parseMembershipRequest);
}

export async function setProjectAvailabilityAction(projectId: string, input: { acceptingMembers: boolean; expectedVersion: number }): Promise<ProjectActionResult> {
  const session = await requireAuthenticatedNiteSession();
  if (!projectIdPattern.test(projectId) || !input || typeof input.acceptingMembers !== "boolean" || !version(input.expectedVersion)) return failure("invalid");
  const current = await getProjectWorkspace(session.bearer, projectId);
  if (current.issue) return failure(current.issue);
  if (!current.data.capabilities.canManageAvailability) return failure("access");
  if (current.data.version !== input.expectedVersion) return failure("conflict");
  return mutate(projectId, session.bearer, "availability", "PATCH", { acceptingMembers: input.acceptingMembers, expectedVersion: input.expectedVersion });
}
