import { projectIdPattern, projectStatuses, type ProjectStatus } from "./integration-contracts";
export type ProjectDetails = { id: string; title: string; description: string; startsOn: string | null; endsOn: string | null; status: ProjectStatus; version: number };
export type ProjectFields = { title: string; description: string; startsOn: string | null; endsOn: string | null; reason: string };
export type ProjectStatusEvent = { id: string; previousStatus: ProjectStatus | null; newStatus: ProjectStatus; reason: string; occurredAt: string };
export type ProjectPeriod = { id: string; memberId: string | null; startedAt: string; endedAt: string | null; startReason: string; endReason: string | null; responsibility?: string };
export type ProjectCandidate = { id: string; name: string };
function record(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === "string"; }
function id(v: unknown): v is string { return text(v) && projectIdPattern.test(v); }
function instant(v: unknown): v is string { return text(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)); }
export function validProjectDate(v: unknown): v is string | null {
 if (v === null) return true;
 if (!text(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
 const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === v;
}
export function isProjectStatus(v: unknown): v is ProjectStatus { return projectStatuses.some(s => s === v); }
export function parseProjectDetails(v: unknown): ProjectDetails | null {
 if (!record(v) || !id(v.id) || !text(v.title) || !text(v.description) || !validProjectDate(v.startsOn) || !validProjectDate(v.endsOn) || !isProjectStatus(v.status) || typeof v.version !== "number" || !Number.isSafeInteger(v.version) || v.version < 0) return null;
 return { id: v.id, title: v.title, description: v.description, startsOn: v.startsOn, endsOn: v.endsOn, status: v.status, version: v.version };
}
export function parseProjectCandidate(v: unknown): ProjectCandidate | null { return record(v) && id(v.id) && text(v.name) ? { id: v.id, name: v.name } : null; }
export function parseProjectStatusEvent(v: unknown): ProjectStatusEvent | null {
 return record(v) && id(v.id) && (v.previousStatus === null || isProjectStatus(v.previousStatus)) && isProjectStatus(v.newStatus) && text(v.reason) && instant(v.occurredAt) ? { id: v.id, previousStatus: v.previousStatus, newStatus: v.newStatus, reason: v.reason, occurredAt: v.occurredAt } : null;
}
export function parseProjectPeriod(v: unknown): ProjectPeriod | null {
 if (!record(v) || !id(v.id) || !(v.memberId === null || id(v.memberId)) || !instant(v.startedAt) || !(v.endedAt === null || instant(v.endedAt)) || !text(v.startReason) || !(v.endReason === null || text(v.endReason)) || !(v.responsibility === undefined || text(v.responsibility))) return null;
 return { id: v.id, memberId: v.memberId, startedAt: v.startedAt, endedAt: v.endedAt, startReason: v.startReason, endReason: v.endReason, ...(v.responsibility !== undefined ? { responsibility: v.responsibility } : {}) };
}
// Mirrors ProjectStatus.canTransitionTo for selection only. The API validates every transition.
export const projectTransitions: Record<ProjectStatus, readonly ProjectStatus[]> = { PLANEJAMENTO: ["ATIVO"], ATIVO: ["PAUSADO", "CONCLUIDO"], PAUSADO: ["ATIVO", "CONCLUIDO"], CONCLUIDO: ["ATIVO"] };
