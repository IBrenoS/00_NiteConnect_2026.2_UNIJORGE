import "server-only";

import { getApiJson } from "../api/server";
import { parseCollectiveSummaryRow, parseFrequencyPage, parseFrequencySummary, parseHistoryEntry, parseListView, parseParticipant, parsePersonalOpenLists } from "./contracts";

export type AgendaEvent = { id: string; title: string; kind: string; modality: string; startsAt: string; endsAt: string | null; status: string; version: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAgendaEvent(value: unknown): AgendaEvent | null {
  if (!record(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.kind !== "string" || typeof value.modality !== "string" || typeof value.startsAt !== "string" || !(value.endsAt === null || typeof value.endsAt === "string") || typeof value.status !== "string" || typeof value.version !== "number") return null;
  return { id: value.id, title: value.title, kind: value.kind, modality: value.modality, startsAt: value.startsAt, endsAt: value.endsAt, status: value.status, version: value.version };
}

function pageQuery(from: string, to: string, page: number, size: number): string {
  return new URLSearchParams({ from, to, page: String(page), size: String(size) }).toString();
}

export function getPersonalFrequencySummary(bearer: string, from: string, to: string, groupBy: "MONTH" | "SEMESTER") {
  const query = new URLSearchParams({ from, to, groupBy });
  return getApiJson(`/api/v1/me/frequency/summary?${query}`, bearer, parseFrequencySummary);
}

export function getPersonalFrequencyHistory(bearer: string, from: string, to: string, page = 0) {
  return getApiJson(`/api/v1/me/frequency/history?${pageQuery(from, to, page, 20)}`, bearer, (value) => parseFrequencyPage(value, parseHistoryEntry));
}

export function getPersonalOpenLists(bearer: string) {
  return getApiJson("/api/v1/me/frequency/open-lists", bearer, parsePersonalOpenLists);
}

export function getFrequencyLists(bearer: string, from: string, to: string, page = 0, status?: string) {
  const query = new URLSearchParams(pageQuery(from, to, page, 50));
  if (status) query.set("status", status);
  return getApiJson(`/api/v1/attendance/lists?${query}`, bearer, (value) => parseFrequencyPage(value, parseListView));
}

export function getFrequencyList(bearer: string, listId: string) {
  return getApiJson(`/api/v1/attendance/lists/${encodeURIComponent(listId)}`, bearer, parseListView);
}

export function getFrequencyParticipants(bearer: string, listId: string, page = 0, status?: string) {
  const query = new URLSearchParams({ page: String(page), size: "50" });
  if (status) query.set("status", status);
  return getApiJson(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/participants?${query}`, bearer, (value) => parseFrequencyPage(value, parseParticipant));
}

export function getCollectiveFrequencySummary(bearer: string, from: string, to: string, page = 0) {
  return getApiJson(`/api/v1/attendance/frequency/summary?${pageQuery(from, to, page, 50)}`, bearer, (value) => parseFrequencyPage(value, parseCollectiveSummaryRow));
}

export function getCollectiveMemberHistory(bearer: string, memberId: string, from: string, to: string, page = 0) {
  return getApiJson(`/api/v1/attendance/frequency/members/${encodeURIComponent(memberId)}/history?${pageQuery(from, to, page, 50)}`, bearer, (value) => parseFrequencyPage(value, parseHistoryEntry));
}

export function getAgendaEvents(bearer: string, from: string, to: string) {
  const query = new URLSearchParams({ from, to, page: "0", size: "100" });
  return getApiJson(`/api/v1/agenda/events?${query}`, bearer, (value) => parseFrequencyPage(value, parseAgendaEvent));
}

export type { CollectiveSummaryRow, FrequencyList, FrequencyPage, FrequencySummary, HistoryEntry, Participant, PersonalOpenList } from "./contracts";
