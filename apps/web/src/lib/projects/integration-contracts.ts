export const projectStatuses = ["PLANEJAMENTO", "ATIVO", "PAUSADO", "CONCLUIDO"] as const;
export type ProjectStatus = typeof projectStatuses[number];
export type ProjectCapabilities = {
  canViewPresentation: boolean; canRequestMembership: boolean; canExpressInterest: boolean; canDecideRequests: boolean;
  canAccessWorkspace: boolean; canViewActivities: boolean; canViewDocuments: boolean; canManageMembers: boolean; canManageAvailability: boolean;
};
type SharedCapabilities = Pick<ProjectCapabilities, "canAccessWorkspace" | "canManageMembers" | "canViewActivities" | "canViewDocuments" | "canManageAvailability">;
export type WorkspaceCapabilities = SharedCapabilities & { canDecideRequests: boolean; canCreatePlanning: boolean; canTransferLeadership: boolean };
export type CatalogProject = {
  id: string; name: string; summary: string; status: ProjectStatus; image: string | null; leaderName: string | null;
  leadershipVacant: boolean; memberCount: number; acceptingMembers: boolean; startsOn: string | null; endsOn: string | null;
  membershipRequestState: MembershipRequest["state"] | null; capabilities: ProjectCapabilities;
};
export type WorkspaceOverview = {
  projectId: string; name: string; description: string; status: ProjectStatus; startsOn: string | null; endsOn: string | null;
  leaderId: string | null; leaderName: string | null; leadershipVacant: boolean; memberCount: number; activityCount: number;
  version: number; acceptingMembers: boolean; capabilities: WorkspaceCapabilities;
};
export type ProjectTeamMember = { id: string; memberId: string; memberName: string | null; responsibility: string; startedAt: string };
export type MembershipRequest = {
  id: string; projectId: string; memberId: string; memberName?: string | null; message: string | null;
  state: "PENDENTE" | "APROVADA" | "REJEITADA" | "ENCERRADA"; requestedAt: string; decidedAt: string | null;
  decidedBy: string | null; decisionMessage: string | null; version: number;
};
export type ProjectRequestEvent = { id: string; requestId: string; actorId: string; type: "SOLICITACAO_CRIADA" | "APROVADA" | "REJEITADA" | "DESISTIDA" | "ENCERRADA"; fromState: string | null; toState: string; message: string | null; occurredAt: string };
export type InterestSignal = { id: string; projectId: string; memberId: string; createdAt: string; message: string | null; withdrawnAt: string | null };
export const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === "string"; }
function nullableText(v: unknown): v is string | null { return v === null || text(v); }
function id(v: unknown): v is string { return text(v) && projectIdPattern.test(v); }
function count(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function date(v: unknown): v is string { if (!text(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v; }
function nullableDate(v: unknown): v is string | null { return v === null || date(v); }
function instant(v: unknown): v is string { return text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)); }
function status(v: unknown): v is ProjectStatus { return projectStatuses.some((s) => s === v); }
function workspaceCapabilities(v: unknown): SharedCapabilities | null {
  if (!record(v) || typeof v.canAccessWorkspace !== "boolean" || typeof v.canManageMembers !== "boolean" || typeof v.canViewActivities !== "boolean" || typeof v.canViewDocuments !== "boolean" || typeof v.canManageAvailability !== "boolean") return null;
  return { canAccessWorkspace: v.canAccessWorkspace, canManageMembers: v.canManageMembers, canViewActivities: v.canViewActivities, canViewDocuments: v.canViewDocuments, canManageAvailability: v.canManageAvailability };
}
export function parseCatalogProject(v: unknown): CatalogProject | null {
  if (!record(v) || !id(v.id) || !text(v.name) || !text(v.summary) || !status(v.status) || !nullableText(v.image) || !nullableText(v.leaderName) || typeof v.leadershipVacant !== "boolean" || !count(v.memberCount) || typeof v.acceptingMembers !== "boolean" || !nullableDate(v.startsOn) || !nullableDate(v.endsOn)) return null;
  const c = v.capabilities; const w = workspaceCapabilities(c);
  if (!w || !record(c) || typeof c.canViewPresentation !== "boolean" || typeof c.canRequestMembership !== "boolean" || typeof c.canExpressInterest !== "boolean" || typeof c.canDecideRequests !== "boolean") return null;
  const requestState = v.membershipRequestState;
  if (!(requestState === null || requestState === "PENDENTE" || requestState === "APROVADA" || requestState === "REJEITADA" || requestState === "ENCERRADA")) return null;
  return { id: v.id, name: v.name, summary: v.summary, status: v.status, image: v.image, leaderName: v.leaderName, leadershipVacant: v.leadershipVacant, memberCount: v.memberCount, acceptingMembers: v.acceptingMembers, startsOn: v.startsOn, endsOn: v.endsOn, membershipRequestState: requestState, capabilities: { ...w, canViewPresentation: c.canViewPresentation, canRequestMembership: c.canRequestMembership, canExpressInterest: c.canExpressInterest, canDecideRequests: c.canDecideRequests } };
}
export function parseWorkspaceOverview(v: unknown): WorkspaceOverview | null {
  if (!record(v) || !id(v.projectId) || !text(v.name) || !text(v.description) || !status(v.status) || !nullableDate(v.startsOn) || !nullableDate(v.endsOn) || !(v.leaderId === null || id(v.leaderId)) || !nullableText(v.leaderName) || typeof v.leadershipVacant !== "boolean" || !count(v.memberCount) || !count(v.activityCount) || !count(v.version) || typeof v.acceptingMembers !== "boolean") return null;
  const shared = workspaceCapabilities(v.capabilities); const c = v.capabilities;
  if (!shared || !record(c) || typeof c.canDecideRequests !== "boolean" || typeof c.canCreatePlanning !== "boolean" || typeof c.canTransferLeadership !== "boolean") return null;
  const capabilities: WorkspaceCapabilities = { ...shared, canDecideRequests: c.canDecideRequests, canCreatePlanning: c.canCreatePlanning, canTransferLeadership: c.canTransferLeadership };
  return { projectId: v.projectId, name: v.name, description: v.description, status: v.status, startsOn: v.startsOn, endsOn: v.endsOn, leaderId: v.leaderId, leaderName: v.leaderName, leadershipVacant: v.leadershipVacant, memberCount: v.memberCount, activityCount: v.activityCount, version: v.version, acceptingMembers: v.acceptingMembers, capabilities };
}
export function parseProjectTeamMember(v: unknown): ProjectTeamMember | null {
  return record(v) && id(v.id) && id(v.memberId) && nullableText(v.memberName) && text(v.responsibility) && instant(v.startedAt) ? { id: v.id, memberId: v.memberId, memberName: v.memberName, responsibility: v.responsibility, startedAt: v.startedAt } : null;
}
export function parseMembershipRequest(v: unknown): MembershipRequest | null {
  if (!record(v) || !id(v.id) || !id(v.projectId) || !id(v.memberId) || !nullableText(v.message) || !(v.state === "PENDENTE" || v.state === "APROVADA" || v.state === "REJEITADA" || v.state === "ENCERRADA") || !instant(v.requestedAt) || !(v.decidedAt === null || instant(v.decidedAt)) || !(v.decidedBy === null || id(v.decidedBy)) || !nullableText(v.decisionMessage) || !count(v.version) || !(v.memberName === undefined || nullableText(v.memberName))) return null;
  return { id: v.id, projectId: v.projectId, memberId: v.memberId, message: v.message, state: v.state, requestedAt: v.requestedAt, decidedAt: v.decidedAt, decidedBy: v.decidedBy, decisionMessage: v.decisionMessage, version: v.version, ...(v.memberName !== undefined ? { memberName: v.memberName } : {}) };
}
export function parseProjectRequestEvent(v: unknown): ProjectRequestEvent | null {
  const types = ["SOLICITACAO_CRIADA", "APROVADA", "REJEITADA", "DESISTIDA", "ENCERRADA"] as const;
  return record(v) && id(v.id) && id(v.requestId) && id(v.actorId) && types.some(type => type === v.type) && (v.fromState === null || text(v.fromState)) && text(v.toState) && nullableText(v.message) && instant(v.occurredAt)
    ? { id: v.id, requestId: v.requestId, actorId: v.actorId, type: v.type as ProjectRequestEvent["type"], fromState: v.fromState, toState: v.toState, message: v.message, occurredAt: v.occurredAt }
    : null;
}
export function parseInterestSignal(v: unknown): InterestSignal | null {
  return record(v) && id(v.id) && id(v.projectId) && id(v.memberId) && instant(v.createdAt) && nullableText(v.message) && (v.withdrawnAt === null || instant(v.withdrawnAt)) ? { id: v.id, projectId: v.projectId, memberId: v.memberId, createdAt: v.createdAt, message: v.message, withdrawnAt: v.withdrawnAt } : null;
}
