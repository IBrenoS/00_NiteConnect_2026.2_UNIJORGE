import { describe, expect, it } from "vitest";
import { resolveCreateMeetingGate, shouldRouteMeetingLinkAction } from "./meeting-action-gate";
import { meetingIssueFromResponse } from "./meeting-api-issues";
import { meetingJoinFailureFeedback, parseMeetingJoinFeedback } from "./meeting-join-feedback";

describe("bloqueios Graph em ações de Reuniões", () => {
  it("encaminha Iniciar reunião e Agendar à página apenas com o consentimento OBO exato", () => {
    expect(resolveCreateMeetingGate({ state: "consent-required", httpStatus: 403, code: "OBO_CONSENT_REQUIRED" })).toBe("authorization-page");
    expect(resolveCreateMeetingGate({ state: "available", httpStatus: 200, code: null })).toBe("open");
    expect(resolveCreateMeetingGate({ state: "admin-approval-required", httpStatus: 403, code: "OBO_ADMIN_APPROVAL_REQUIRED" })).toBe("disabled");
    expect(resolveCreateMeetingGate({ state: "unavailable", httpStatus: 403, code: "FORBIDDEN" })).toBe("disabled");
    expect(resolveCreateMeetingGate(null)).toBe("disabled");
  });

  it("preserva Entrar no Teams e WhatsApp fora do consentimento OBO confirmado", () => {
    expect(shouldRouteMeetingLinkAction({ state: "consent-required", httpStatus: 403, code: "OBO_CONSENT_REQUIRED" })).toBe(true);
    expect(shouldRouteMeetingLinkAction({ state: "available", httpStatus: 200, code: null })).toBe(false);
    expect(shouldRouteMeetingLinkAction({ state: "unavailable", httpStatus: 403, code: "FORBIDDEN" })).toBe(false);
    expect(shouldRouteMeetingLinkAction({ state: "admin-approval-required", httpStatus: 403, code: "OBO_ADMIN_APPROVAL_REQUIRED" })).toBe(false);
    expect(shouldRouteMeetingLinkAction(null)).toBe(false);
  });

  it("classifica consentimento somente para HTTP 403 e código exato nas mutações e no share", () => {
    expect(meetingIssueFromResponse(403, "OBO_CONSENT_REQUIRED")).toBe("consent-required");
    expect(meetingIssueFromResponse(403, "OBO_ADMIN_APPROVAL_REQUIRED")).toBe("admin-approval-required");
    expect(meetingIssueFromResponse(403, "FORBIDDEN")).toBe("access");
    expect(meetingIssueFromResponse(500, "OBO_CONSENT_REQUIRED")).toBe("graph-unavailable");
    expect(meetingIssueFromResponse(503, null)).toBe("unavailable");
  });

  it("não confunde erros genéricos de join com o código de consentimento", () => {
    expect(meetingJoinFailureFeedback(403, "OBO_CONSENT_REQUIRED")).toBe("consent-required");
    expect(meetingJoinFailureFeedback(403, "FORBIDDEN")).toBe("forbidden");
    expect(meetingJoinFailureFeedback(401, "OBO_CONSENT_REQUIRED")).toBe("forbidden");
    expect(meetingJoinFailureFeedback(404, null)).toBe("not-found");
    expect(meetingJoinFailureFeedback(503, null)).toBe("unavailable");
  });

  it("aceita somente feedbacks conhecidos no retorno à página de Reuniões", () => {
    expect(parseMeetingJoinFeedback("forbidden")).toBe("forbidden");
    expect(parseMeetingJoinFeedback("not-found")).toBe("not-found");
    expect(parseMeetingJoinFeedback("unavailable")).toBe("unavailable");
    expect(parseMeetingJoinFeedback("consent-required")).toBeNull();
    expect(parseMeetingJoinFeedback("anything")).toBeNull();
    expect(parseMeetingJoinFeedback(["forbidden", "not-found"])).toBe("forbidden");
  });
});
