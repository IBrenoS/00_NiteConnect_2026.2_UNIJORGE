"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedNiteSession } from "../auth/server-session";
import { apiIssueFromStatus } from "../api/contracts";
import { resolveApiUrl } from "../api/server";
import { canManageFrequency } from "./query";
import { parseConfirmation, parseListView, parseQrPayload, type Confirmation, type FrequencyList, type QrPayload } from "./contracts";
import { frequencyScanUrl } from "./qr";
import { qrSvg } from "./qr-image";

type MutationIssue = "access" | "not-found" | "conflict" | "invalid" | "unavailable";
type MutationResult<T> = { data: T; issue: null } | { data: null; issue: MutationIssue };
export type FrequencyActionResult = { kind: "success"; confirmation: Confirmation } | { kind: "error"; message: string };
export type ProjectorQrResult = { ok: true; svg: string; expiresAt: string; version: number } | { ok: false; message: string };
export type ProjectorUpdate = { version: number; status: string; qrVersion: number; qrExpiresAt: string | null; action: string; occurredAt: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const qrPattern = /^[A-Za-z0-9_-]{43}$/;
const versionPattern = /^(0|[1-9]\d{0,11})$/;

function stringField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseVersion(value: string): number | null {
  if (!versionPattern.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

async function mutate<T>(path: string, bearer: string | null, method: "POST" | "PATCH", body: unknown, parse: (value: unknown) => T | null, extraHeaders: Record<string, string> = {}): Promise<MutationResult<T>> {
  const url = resolveApiUrl(path);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      if (response.status === 409) return { data: null, issue: "conflict" };
      if (response.status === 400 || response.status === 422) return { data: null, issue: "invalid" };
      return { data: null, issue: apiIssueFromStatus(response.status) };
    }
    const parsed = parse(await response.json());
    return parsed ? { data: parsed, issue: null } : { data: null, issue: "invalid" };
  } catch {
    return { data: null, issue: "unavailable" };
  }
}

function issueMessage(issue: MutationIssue | null): string {
  if (issue === "access") return "Esta operação não está autorizada para sua conta.";
  if (issue === "not-found") return "A lista não está disponível para esta conta.";
  if (issue === "conflict") return "A lista mudou ou a janela expirou. Atualize a consulta antes de tentar novamente.";
  if (issue === "invalid") return "Não foi possível aceitar esta ação. Confira as informações e tente novamente.";
  return "Não foi possível confirmar agora. Tente novamente.";
}

async function authorizedManager() {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  if (!canManageFrequency(session.roles)) redirect("/frequencia?error=access");
  return session;
}

export async function confirmFrequencyQr(qrToken: string): Promise<FrequencyActionResult> {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  if (!qrPattern.test(qrToken)) return { kind: "error", message: "O QR não contém um código válido da Frequência." };
  const result = await mutate("/api/v1/me/frequency/confirmations", session.bearer, "POST", { qrToken }, parseConfirmation);
  return result.issue ? { kind: "error", message: issueMessage(result.issue) } : { kind: "success", confirmation: result.data };
}

export async function confirmFrequencyHandoff(): Promise<FrequencyActionResult> {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  const cookieStore = await cookies();
  const handoffId = cookieStore.get("__Host-nite-frequency-handoff")?.value;
  if (!handoffId || !/^[A-Za-z0-9_-]{32,64}$/.test(handoffId)) {
    cookieStore.delete("__Host-nite-frequency-handoff");
    return { kind: "error", message: "Este acesso expirou. Leia novamente o QR Code projetado." };
  }
  const result = await mutate("/api/v1/me/frequency/confirmations", session.bearer, "POST", { handoffId }, parseConfirmation);
  if (result.issue !== "unavailable") cookieStore.delete("__Host-nite-frequency-handoff");
  return result.issue ? { kind: "error", message: result.issue === "conflict" ? "O QR ou a lista expirou antes da confirmação. Faça uma nova leitura." : issueMessage(result.issue) } : { kind: "success", confirmation: result.data };
}

export async function openFrequencyList(form: FormData): Promise<never> {
  const session = await authorizedManager();
  if (!publicAppOrigin()) redirect("/frequencia?mode=meeting&error=origin");
  const idempotencyKey = stringField(form, "idempotencyKey");
  const eventId = stringField(form, "calendarEventId");
  const meetingName = stringField(form, "meetingName");
  const windowMinutes = Number(stringField(form, "confirmationWindowMinutes"));
  const classification = stringField(form, "classification");
  const countsValue = stringField(form, "countsForFrequency");
  if (!uuid.test(idempotencyKey) || ![3, 5, 10].includes(windowMinutes) || (eventId && !uuid.test(eventId)) || (!eventId && (meetingName.length < 3 || meetingName.length > 200)) || (!eventId && classification !== "REGULAR" && classification !== "EXCEPTIONAL") || (!eventId && classification === "EXCEPTIONAL" && countsValue !== "true" && countsValue !== "false")) redirect("/frequencia?mode=meeting&error=invalid");

  const body: Record<string, string | number | boolean> = { confirmationWindowMinutes: windowMinutes };
  if (eventId) body.calendarEventId = eventId;
  else {
    body.meetingName = meetingName;
    if (classification === "EXCEPTIONAL") body.countsForFrequency = countsValue === "true";
  }
  const opened = await mutate("/api/v1/attendance/lists", session.bearer, "POST", body, parseListView, { "Idempotency-Key": idempotencyKey });
  if (opened.issue) redirect(`/frequencia?mode=meeting&error=${opened.issue}${opened.issue === "unavailable" ? `&openKey=${encodeURIComponent(idempotencyKey)}` : ""}`);

  const qr = await mutate(`/api/v1/attendance/lists/${encodeURIComponent(opened.data.listId)}/qr/renew`, session.bearer, "POST", { expectedVersion: opened.data.version }, parseQrPayload);
  if (qr.issue) redirect(`/frequencia?mode=meeting&list=${encodeURIComponent(opened.data.listId)}&error=qr`);
  const cookieStore = await cookies();
  const maxAge = Math.max(1, Math.min(120, Math.floor((Date.parse(qr.data.expiresAt) - Date.now()) / 1_000)));
  setProjectorQrCookie(cookieStore, opened.data.listId, qr.data, maxAge);
  redirect(`/frequency/lists/${opened.data.listId}/projector`);
}

export async function renewFrequencyQr(listId: string, expectedVersion: number): Promise<ProjectorQrResult> {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  if (!canManageFrequency(session.roles) || !uuid.test(listId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { ok: false, message: "A lista não está disponível para esta conta." };
  const origin = publicAppOrigin();
  if (!origin) return { ok: false, message: "Configure a origem pública do NITE Connect para emitir o QR." };
  const result = await mutate(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/qr/renew`, session.bearer, "POST", { expectedVersion }, parseQrPayload);
  if (result.issue) return { ok: false, message: result.issue === "conflict" ? "A lista mudou. Recarregue a projeção para obter o QR vigente." : issueMessage(result.issue) };
  return { ok: true, svg: qrSvg(frequencyScanUrl(result.data.qrToken, origin, result.data.listId)), expiresAt: result.data.expiresAt, version: result.data.version };
}

export async function pollFrequencyProjector(listId: string, afterVersion: number): Promise<{ ok: true; list: FrequencyList; updates: ProjectorUpdate[] } | { ok: false; message: string }> {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  if (!canManageFrequency(session.roles) || !uuid.test(listId) || !Number.isSafeInteger(afterVersion) || afterVersion < 0) return { ok: false, message: "Esta projeção não está disponível para sua conta." };
  const listResult = await fetchFrequencyListActionData(session.bearer, listId);
  if (listResult.issue || !listResult.data) return { ok: false, message: issueMessage(listResult.issue) };
  const url = resolveApiUrl(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/updates?afterVersion=${afterVersion}`);
  if (!url) return { ok: false, message: "A API de Frequência não está configurada." };
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.bearer}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { ok: false, message: issueMessage(response.status === 409 ? "conflict" : apiIssueFromStatus(response.status)) };
    const raw: unknown = await response.json();
    if (!Array.isArray(raw)) return { ok: false, message: "A API retornou atualizações inválidas." };
    const updates = raw.map(parseProjectorUpdate);
    if (updates.some((update) => update === null)) return { ok: false, message: "A API retornou atualizações inválidas." };
    return { ok: true, list: listResult.data, updates: updates.filter((update): update is ProjectorUpdate => update !== null) };
  } catch {
    return { ok: false, message: "Não foi possível atualizar a projeção." };
  }
}

async function fetchFrequencyListActionData(bearer: string, listId: string): Promise<{ data: FrequencyList | null; issue: MutationIssue | null }> {
  const url = resolveApiUrl(`/api/v1/attendance/lists/${encodeURIComponent(listId)}`);
  if (!url) return { data: null, issue: "unavailable" };
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return { data: null, issue: apiIssueFromStatus(response.status) };
    const data = parseListView(await response.json());
    return data ? { data, issue: null } : { data: null, issue: "invalid" };
  } catch {
    return { data: null, issue: "unavailable" };
  }
}

function parseProjectorUpdate(value: unknown): ProjectorUpdate | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.version !== "number" || typeof item.status !== "string" || typeof item.qrVersion !== "number" || !(item.qrExpiresAt === null || typeof item.qrExpiresAt === "string") || typeof item.action !== "string" || typeof item.occurredAt !== "string") return null;
  return { version: item.version, status: item.status, qrVersion: item.qrVersion, qrExpiresAt: item.qrExpiresAt, action: item.action, occurredAt: item.occurredAt };
}

export async function finalizeFrequencyList(form: FormData): Promise<never> {
  const session = await authorizedManager();
  const listId = stringField(form, "listId");
  const expectedVersion = parseVersion(stringField(form, "expectedVersion"));
  const outcome = stringField(form, "outcome");
  if (!uuid.test(listId) || expectedVersion === null || (outcome !== "REALIZADA_CONTABILIZAVEL" && outcome !== "REALIZADA_NAO_CONTABILIZAVEL" && outcome !== "NAO_REALIZADA")) redirect("/frequencia?mode=meeting&error=invalid");
  const reason = outcome === "NAO_REALIZADA" ? "Reunião não realizada" : outcome === "REALIZADA_NAO_CONTABILIZAVEL" ? "Reunião realizada fora da apuração" : "Reunião realizada";
  const result = await mutate(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/finalize`, session.bearer, "POST", { expectedVersion, outcome, reason }, parseListView);
  redirect(`/frequencia?mode=meeting&list=${encodeURIComponent(listId)}${result.issue ? `&error=${result.issue}` : "&notice=finalized"}`);
}

export async function cancelFrequencyList(form: FormData): Promise<never> {
  const session = await authorizedManager();
  const listId = stringField(form, "listId");
  const expectedVersion = parseVersion(stringField(form, "expectedVersion"));
  if (!uuid.test(listId) || expectedVersion === null || stringField(form, "confirmed") !== "true") redirect("/frequencia?mode=meeting&error=invalid");
  const result = await mutate(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/cancel`, session.bearer, "POST", { expectedVersion, reason: "Reunião cancelada pela gestão", confirmed: true }, parseListView);
  redirect(`/frequencia?mode=meeting&list=${encodeURIComponent(listId)}${result.issue ? `&error=${result.issue}` : "&notice=canceled"}`);
}

export async function changeFrequencyParticipant(form: FormData): Promise<never> {
  const session = await authorizedManager();
  const listId = stringField(form, "listId");
  const memberId = stringField(form, "memberId");
  const expectedVersion = parseVersion(stringField(form, "expectedVersion"));
  const targetStatus = stringField(form, "targetStatus");
  if (!uuid.test(listId) || !uuid.test(memberId) || expectedVersion === null || (targetStatus !== "JUSTIFICADO" && targetStatus !== "AUSENTE")) redirect("/frequencia?mode=meeting&error=invalid");
  const reason = targetStatus === "JUSTIFICADO" ? "EMAIL_EXTERNO_RECEBIDO" : "CORRECAO_ADMINISTRATIVA";
  const result = await mutate(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/participants/${encodeURIComponent(memberId)}`, session.bearer, "PATCH", { expectedVersion, targetStatus, reason }, (value) => typeof value === "object" && value !== null ? value : null);
  redirect(`/frequencia?mode=meeting&list=${encodeURIComponent(listId)}${result.issue ? `&error=${result.issue}` : "&notice=updated"}`);
}

export async function renewFrequencyListQr(form: FormData): Promise<never> {
  const session = await authorizedManager();
  if (!publicAppOrigin()) redirect("/frequencia?mode=meeting&error=origin");
  const listId = stringField(form, "listId");
  const expectedVersion = parseVersion(stringField(form, "expectedVersion"));
  if (!uuid.test(listId) || expectedVersion === null) redirect("/frequencia?mode=meeting&error=invalid");
  const result = await mutate(`/api/v1/attendance/lists/${encodeURIComponent(listId)}/qr/renew`, session.bearer, "POST", { expectedVersion }, parseQrPayload);
  if (result.issue) redirect(`/frequencia?mode=meeting&list=${encodeURIComponent(listId)}&error=${result.issue}`);
  const cookieStore = await cookies();
  const maxAge = Math.max(1, Math.min(120, Math.floor((Date.parse(result.data.expiresAt) - Date.now()) / 1_000)));
  setProjectorQrCookie(cookieStore, listId, result.data, maxAge);
  redirect(`/frequency/lists/${listId}/projector`);
}

export async function qrSvgFromProjectorCookie(listId: string): Promise<{ svg: string; expiresAt: string } | null> {
  const cookieStore = await cookies();
  const name = `nite-frequency-projector-${listId}`;
  const value = cookieStore.get(name)?.value;
  const [token, expiresAt] = value?.split("~") ?? [];
  if (!token || !qrPattern.test(token) || !expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) return null;
  const origin = publicAppOrigin();
  if (!origin) return null;
  cookieStore.delete(name);
  return { svg: qrSvg(frequencyScanUrl(token, origin, listId)), expiresAt };
}

function setProjectorQrCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, listId: string, qr: QrPayload, maxAge: number): void {
  cookieStore.set(`nite-frequency-projector-${listId}`, `${qr.qrToken}~${qr.expiresAt}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: `/frequency/lists/${listId}/projector`,
    maxAge,
  });
}

function publicAppOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (configured) {
    try {
      const url = new URL(configured);
      if ((url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) && url.pathname === "/" && !url.search && !url.hash) return url.origin;
    } catch { return null; }
    return null;
  }
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}
