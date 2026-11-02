import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  cookies: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  cookieSet: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../auth/server-session", () => ({ getAuthenticatedNiteSession: mocks.getSession }));
vi.mock("../api/server", () => ({ resolveApiUrl: (path: string) => new URL(path, process.env.API_BASE_URL) }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { cancelFrequencyList, changeFrequencyParticipant, confirmFrequencyHandoff, confirmFrequencyQr, finalizeFrequencyList, openFrequencyList } from "./actions";

const listId = "93000000-0000-4000-8000-000000000001";
const eventId = "93000000-0000-4000-8000-000000000002";
const memberId = "93000000-0000-4000-8000-000000000003";
const idempotencyKey = "93000000-0000-4000-8000-000000000004";
const token = "A".repeat(43);
const list = {
  listId, calendarEventId: eventId, meetingName: "Reunião semanal", classification: "REGULAR", countsForFrequency: true,
  status: "ABERTA", outcome: null, openedAt: "2026-11-05T21:00:00Z", openedBy: { memberId, displayName: "Coordenação", role: "COORDENADOR" },
  confirmationWindowMinutes: 5, confirmationDeadline: "2026-11-05T21:05:00Z", closedAt: null, closedBy: null, qr: null, version: 0,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("ações server-side da Frequência", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "https://api.example.invalid");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_ORIGIN", "https://nite.example.org");
    mocks.getSession.mockResolvedValue({ bearer: "server-only-bearer", roles: ["COORDENADOR"] });
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet, delete: mocks.cookieDelete, set: mocks.cookieSet });
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("confirma QR autenticado pelo endpoint canônico sem enviar identidade do cliente", async () => {
    const confirmation = { attendanceId: memberId, calendarEventId: eventId, listId, status: "PRESENTE", confirmedAt: "2026-11-05T21:02:00Z", alreadyRegistered: false };
    mocks.fetch.mockResolvedValueOnce(jsonResponse(confirmation, 201));
    await expect(confirmFrequencyQr(token)).resolves.toEqual({ kind: "success", confirmation });
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/me/frequency/confirmations");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer server-only-bearer" });
    expect(JSON.parse(String(init.body))).toEqual({ qrToken: token });
  });

  it("não chama a API para QR malformado nem anuncia sucesso em conflito", async () => {
    await expect(confirmFrequencyQr("bad-token")).resolves.toMatchObject({ kind: "error" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ code: "QR_EXPIRED" }, 409));
    await expect(confirmFrequencyQr(token)).resolves.toMatchObject({ kind: "error", message: expect.stringContaining("expirou") });
  });

  it("preserva a confirmação idempotente já registrada pelo backend", async () => {
    const confirmation = { attendanceId: memberId, calendarEventId: eventId, listId, status: "PRESENTE", confirmedAt: "2026-11-05T21:02:00Z", alreadyRegistered: true };
    mocks.fetch.mockResolvedValueOnce(jsonResponse(confirmation));
    await expect(confirmFrequencyQr(token)).resolves.toEqual({ kind: "success", confirmation });
  });

  it("consome handoff somente por POST autenticado e limpa cookie após resultado conclusivo", async () => {
    mocks.cookieGet.mockReturnValue({ value: "H".repeat(43) });
    const confirmation = { attendanceId: memberId, calendarEventId: eventId, listId, status: "PRESENTE", confirmedAt: "2026-11-05T21:02:00Z", alreadyRegistered: true };
    mocks.fetch.mockResolvedValueOnce(jsonResponse(confirmation));
    await expect(confirmFrequencyHandoff()).resolves.toMatchObject({ kind: "success", confirmation });
    const [url, init] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/me/frequency/confirmations");
    expect(JSON.parse(String(init.body))).toEqual({ handoffId: "H".repeat(43) });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("__Host-nite-frequency-handoff");
  });

  it("reconhece confirmação idempotente mesmo após expirar a janela do QR", async () => {
    mocks.cookieGet.mockReturnValue({ value: "H".repeat(43) });
    const confirmation = { attendanceId: memberId, calendarEventId: eventId, listId, status: "PRESENTE", confirmedAt: "2026-11-05T21:02:00Z", alreadyRegistered: true };
    mocks.fetch.mockResolvedValueOnce(jsonResponse(confirmation));
    await expect(confirmFrequencyHandoff()).resolves.toEqual({ kind: "success", confirmation });
  });

  it("não presume presença quando o backend recusa handoff expirado sem confirmação anterior", async () => {
    mocks.cookieGet.mockReturnValue({ value: "H".repeat(43) });
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ code: "HANDOFF_EXPIRED" }, 409));
    await expect(confirmFrequencyHandoff()).resolves.toMatchObject({ kind: "error", message: expect.stringContaining("expirou") });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("__Host-nite-frequency-handoff");
  });

  it("abre com Idempotency-Key, emite o QR e protege o token no cookie do projetor", async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse(list, 201));
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ listId, qrToken: token, qrVersion: 1, expiresAt: new Date(Date.now() + 60_000).toISOString(), version: 1 }));
    await expect(openFrequencyList(form({ idempotencyKey, calendarEventId: eventId, meetingName: "", confirmationWindowMinutes: "5", classification: "REGULAR", countsForFrequency: "" }))).rejects.toThrow(`redirect:/frequency/lists/${listId}/projector`);
    const [, openRequest] = mocks.fetch.mock.calls[0] as [URL, RequestInit];
    expect(openRequest.headers).toMatchObject({ "Idempotency-Key": idempotencyKey, Authorization: "Bearer server-only-bearer" });
    expect(mocks.cookieSet).toHaveBeenCalledWith(`nite-frequency-projector-${listId}`, expect.stringContaining(`${token}~`), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "strict", path: `/frequency/lists/${listId}/projector` }));
  });

  it("exige papel de gestão antes de qualquer escrita coletiva", async () => {
    mocks.getSession.mockResolvedValue({ bearer: "member-bearer", roles: ["INTEGRANTE"] });
    await expect(finalizeFrequencyList(form({ listId, expectedVersion: "0", outcome: "REALIZADA_CONTABILIZAVEL" }))).rejects.toThrow("redirect:/frequencia?error=access");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("finaliza e cancela por versões explícitas; justificativas usam apenas códigos fixos", async () => {
    const finalized = { ...list, status: "CONCLUIDA", outcome: "REALIZADA_CONTABILIZAVEL", version: 2 };
    mocks.fetch.mockResolvedValueOnce(jsonResponse(finalized));
    await expect(finalizeFrequencyList(form({ listId, expectedVersion: "1", outcome: "REALIZADA_CONTABILIZAVEL" }))).rejects.toThrow(`redirect:/frequencia?mode=meeting&list=${listId}&notice=finalized`);
    expect(mocks.fetch.mock.calls[0]?.[0]).toMatchObject({ pathname: `/api/v1/attendance/lists/${listId}/finalize` });
    expect(JSON.parse(String((mocks.fetch.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ expectedVersion: 1, outcome: "REALIZADA_CONTABILIZAVEL" });

    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ...list, status: "CANCELADA", version: 2 }));
    await expect(cancelFrequencyList(form({ listId, expectedVersion: "1", confirmed: "true" }))).rejects.toThrow(`redirect:/frequencia?mode=meeting&list=${listId}&notice=canceled`);
    expect(JSON.parse(String((mocks.fetch.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({ expectedVersion: 1, confirmed: true });

    mocks.fetch.mockResolvedValueOnce(jsonResponse({ memberId, displayName: "Ana Costa", status: "JUSTIFICADO", confirmedAt: null, changedAt: "2026-11-05T21:03:00Z", changedBy: memberId, reason: "Comunicação externa recebida por e-mail" }));
    await expect(changeFrequencyParticipant(form({ listId, memberId, expectedVersion: "2", targetStatus: "JUSTIFICADO" }))).rejects.toThrow(`redirect:/frequencia?mode=meeting&list=${listId}&notice=updated`);
    expect(JSON.parse(String((mocks.fetch.mock.calls[2]?.[1] as RequestInit).body))).toEqual({ expectedVersion: 2, targetStatus: "JUSTIFICADO", reason: "EMAIL_EXTERNO_RECEBIDO" });
  });
});
