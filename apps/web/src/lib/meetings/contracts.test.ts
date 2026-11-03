import { describe, expect, it } from "vitest";
import { appendMeetingPages, parseMeeting, parseMeetingNotification, parseMeetingWriteResult, resolveMeetingGraphAvailability } from "./contracts";
import * as meetingContracts from "./contracts";

const meeting = {
  id: "67000000-0000-4000-8000-000000000001",
  mode: "SCHEDULED",
  status: "AGUARDANDO_TEAMS",
  provider: "TEAMS_LINK",
  providerState: "AGUARDANDO_CRIACAO_NO_TEAMS",
  title: "Alinhamento de projeto",
  startsAt: "2026-11-05T13:00:00Z",
  plannedDurationMinutes: 60,
  plannedEndsAt: "2026-11-05T14:00:00Z",
  actualStartsAt: null,
  actualEndsAt: null,
  actualDurationSeconds: null,
  organizerMemberId: "67000000-0000-4000-8000-000000000002",
  organizerName: "Integrante NITE",
  invitees: [{ memberId: "67000000-0000-4000-8000-000000000003", name: "Convidado NITE", internalStatus: "PENDENTE", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: null, version: 0 }],
  version: 1,
  createdAt: "2026-11-02T12:00:00Z",
  updatedAt: "2026-11-02T12:00:00Z",
};

describe("contratos web de Reuniões", () => {
  it("valida a resposta completa antes de aceitar capabilities Graph", () => {
    const payload = {
      allowedOnlineMeetingProviders: ["teamsForBusiness"],
      defaultOnlineMeetingProvider: "teamsForBusiness",
      supportsTeamsForBusiness: true,
    };

    expect(resolveMeetingGraphAvailability(200, payload)).toEqual({ state: "available", httpStatus: 200, code: null });
    expect(resolveMeetingGraphAvailability(200, { ...payload, supportsTeamsForBusiness: false })).toEqual({ state: "teams-unavailable", httpStatus: 200, code: null });
    expect(resolveMeetingGraphAvailability(200, { supportsTeamsForBusiness: true })).toEqual({ state: "unavailable", httpStatus: 200, code: null });
  });

  it("classifica apenas o código OBO exato como consentimento pendente", () => {
    expect(resolveMeetingGraphAvailability(403, { code: "OBO_CONSENT_REQUIRED", detail: "conteúdo privado" })).toEqual({ state: "consent-required", httpStatus: 403, code: "OBO_CONSENT_REQUIRED" });
    expect(resolveMeetingGraphAvailability(403, { code: "OBO_ADMIN_APPROVAL_REQUIRED" })).toEqual({ state: "admin-approval-required", httpStatus: 403, code: "OBO_ADMIN_APPROVAL_REQUIRED" });
    expect(resolveMeetingGraphAvailability(403, { code: "FORBIDDEN" })).toEqual({ state: "unavailable", httpStatus: 403, code: "FORBIDDEN" });
    expect(resolveMeetingGraphAvailability(403, { code: "GRAPH_OBO_NOT_CONFIGURED" })).toEqual({ state: "not-configured", httpStatus: 403, code: "GRAPH_OBO_NOT_CONFIGURED" });
    expect(resolveMeetingGraphAvailability(401, null)).toEqual({ state: "session-required", httpStatus: 401, code: null });
    expect(resolveMeetingGraphAvailability(503, { detail: "resposta do provedor" })).toEqual({ state: "unavailable", httpStatus: 503, code: null });
  });

  it("exige HTTP 403 e o código real para encaminhar à tela de consentimento", () => {
    const consent = { state: "consent-required", httpStatus: 403, code: "OBO_CONSENT_REQUIRED" } as const;
    const isConsentRequired = Reflect.get(meetingContracts, "isMeetingGraphConsentRequired");
    expect(isConsentRequired).toBeTypeOf("function");
    if (typeof isConsentRequired !== "function") return;
    expect(isConsentRequired(consent)).toBe(true);
    expect(isConsentRequired({ ...consent, httpStatus: 200 })).toBe(false);
    expect(isConsentRequired({ ...consent, code: "OBO_ADMIN_APPROVAL_REQUIRED" })).toBe(false);
  });

  it("preserva duração real nula e estados internos e Microsoft separados", () => {
    expect(parseMeeting(meeting)).toMatchObject({
      status: "AGUARDANDO_TEAMS",
      actualDurationSeconds: null,
      invitees: [{ internalStatus: "PENDENTE", calendarResponseStatus: "NAO_SINCRONIZADO" }],
    });
  });

  it("aceita reuniões Graph cujo estado TEAMS_LINK é nulo", () => {
    expect(parseMeeting({ ...meeting, provider: "GRAPH", providerState: null, status: "AGENDADA" })).toMatchObject({ provider: "GRAPH", providerState: null, status: "AGENDADA" });
    expect(parseMeeting({ ...meeting, provider: "GRAPH", providerState: "LINK_CONFIRMADO_PELO_ORGANIZADOR" })).toBeNull();
  });

  it("não aceita reunião com dado de participação malformado", () => {
    expect(parseMeeting({ ...meeting, actualDurationSeconds: -1 })).toBeNull();
    expect(parseMeeting({ ...meeting, invitees: [{ ...meeting.invitees[0], internalStatus: "ACEITO_POR_EMAIL" }] })).toBeNull();
  });

  it("aceita resposta operacional indeterminada sem apresentá-la como reunião criada", () => {
    expect(parseMeetingWriteResult({ meetingId: meeting.id, operationId: "op-1", operationStatus: "RESULTADO_INDETERMINADO", retryable: true, retryAfter: null })).toMatchObject({ kind: "operation" });
  });

  it("valida as notificações persistidas do contrato", () => {
    expect(parseMeetingNotification({ id: "notification-1", meetingId: meeting.id, type: "CONVITE_RECEBIDO", title: meeting.title, startsAt: meeting.startsAt, createdAt: meeting.createdAt, readAt: null })?.readAt).toBeNull();
    expect(parseMeetingNotification({ id: "notification-1", meetingId: meeting.id, type: "CONVITE_RECEBIDO", title: meeting.title, startsAt: "invalid", createdAt: meeting.createdAt, readAt: null })).toBeNull();
  });

  it("acrescenta páginas sem duplicar reuniões repetidas na fronteira", () => {
    const firstPage = { items: [{ id: "meeting-1" }, { id: "meeting-2" }], page: 0, size: 2, total: 4 };
    const nextPage = { items: [{ id: "meeting-2" }, { id: "meeting-3" }, { id: "meeting-3" }], page: 1, size: 2, total: 4 };

    expect(appendMeetingPages(firstPage, nextPage)).toEqual({ items: [{ id: "meeting-1" }, { id: "meeting-2" }, { id: "meeting-3" }], page: 1, size: 2, total: 4 });
  });
});
