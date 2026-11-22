import "server-only";
import { getApiJson } from "../api/server";
import { parsePage } from "../activities/contracts";
import { memberStatuses, type MemberStatus } from "./status";
export { statusLabel, roleLabel } from "./status";

export type MemberSummary = { id: string; name: string; institutionalEmail: string; status: MemberStatus; roles: string[]; hasPhoto: boolean; lastAccessAt: string | null };
export type MemberDetail = MemberSummary & { course: string | null; practiceArea: string | null; birthDate: string | null; version: number };
export type MemberEvent = { id: string; kind: string; previousValue: string | null; newValue: string | null; actorName: string | null; reason: string | null; occurredAt: string; technical: boolean };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const nullable = (value: unknown): value is string | null => value === null || typeof value === "string";
export function parseSummary(value: unknown): MemberSummary | null {
  if (!record(value) || typeof value.id !== "string" || typeof value.name !== "string"
    || typeof value.institutionalEmail !== "string" || !memberStatuses.includes(value.status as MemberStatus)
    || !Array.isArray(value.roles) || !value.roles.every(role => typeof role === "string")
    || typeof value.hasPhoto !== "boolean" || !nullable(value.lastAccessAt)) return null;
  return { id: value.id, name: value.name, institutionalEmail: value.institutionalEmail,
    status: value.status as MemberStatus, roles: value.roles, hasPhoto: value.hasPhoto, lastAccessAt: value.lastAccessAt };
}
export function parseDetail(value: unknown): MemberDetail | null {
  const base = parseSummary(value);
  if (!base || !record(value) || !nullable(value.course) || !nullable(value.practiceArea)
    || !nullable(value.birthDate) || typeof value.version !== "number") return null;
  return { ...base, course: value.course, practiceArea: value.practiceArea,
    birthDate: value.birthDate, version: value.version };
}
export function parseEvent(value: unknown): MemberEvent | null {
  if (!record(value) || typeof value.id !== "string" || typeof value.kind !== "string"
    || !nullable(value.previousValue) || !nullable(value.newValue) || !nullable(value.actorName)
    || !nullable(value.reason) || typeof value.occurredAt !== "string" || typeof value.technical !== "boolean") return null;
  return { id: value.id, kind: value.kind, previousValue: value.previousValue, newValue: value.newValue,
    actorName: value.actorName, reason: value.reason, occurredAt: value.occurredAt, technical: value.technical };
}
export const getMembers = (bearer: string, q: string, status: string, page: number) =>
  getApiJson(`/api/v1/administrative/members?${new URLSearchParams({ q, ...(status ? { status } : {}), page: String(page), size: "20" })}`,
    bearer, value => parsePage(value, parseSummary));
export const getMember = (bearer: string, id: string) =>
  getApiJson(`/api/v1/administrative/members/${id}`, bearer, parseDetail);
export const getMemberHistory = (bearer: string, id: string, page: number) =>
  getApiJson(`/api/v1/administrative/members/${id}/history?page=${page}&size=20`, bearer,
    value => parsePage(value, parseEvent));
