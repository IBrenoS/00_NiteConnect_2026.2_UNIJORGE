import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), invitations: vi.fn(), members: vi.fn() }));
vi.mock("../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.session }));
vi.mock("../../../../lib/access-management/data", () => ({
  invitationStates: ["ALL", "PENDING", "ACCEPTED", "EXPIRED", "REVOKED", "SEND_FAILED"],
  getInvitations: mocks.invitations, getMembers: mocks.members,
  invitationStatus: () => "Pendente",
}));
vi.mock("../../../../components/access-management/controls", () => ({ InvitationControls: () => null, RoleControls: () => null }));
import Page from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ bearer: "private-bearer", roles: ["COORDENADOR"] });
  mocks.invitations.mockResolvedValue({ data: { items: [{ id: "invite-id", memberId: "member-id", name: "Ana", email: "ana@unijorge.com.br", initialRole: "GESTOR_PROJETO", createdAt: "2026-11-21T10:00:00Z", expiresAt: "2026-11-28T10:00:00Z", acceptedAt: null, revokedAt: null, sendState: "ACCEPTED_BY_PROVIDER", sendAttempts: 1, sendErrorCode: null, lastSendAt: "2026-11-21T10:00:00Z" }], total: 1 }, issue: null });
  mocks.members.mockResolvedValue({ data: { items: [{ id: "member-id", name: "Ana", institutionalEmail: "ana@unijorge.com.br", roles: ["INTEGRANTE", "GESTOR_PROJETO"], status: "ATIVO", lastAccessAt: null }], total: 1 }, issue: null });
});
describe("perspectivas administrativas", () => {
  it("mostra aceite do provedor sem prometer entrega e filtra no servidor", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ tab: "convites", q: "Ana", state: "PENDING" }) }));
    expect(mocks.invitations).toHaveBeenCalledWith("private-bearer", "PENDING", 0, "Ana");
    expect(html).toContain("Aceito pelo provedor; entrega não confirmada");
    expect(html).toContain("Gestor de projeto");
    expect(html).not.toContain("private-bearer");
  });
  it("distingue falta de último acesso de falha da consulta", async () => {
    let html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ tab: "acessos" }) }));
    expect(html).toContain("Sem registro");
    mocks.members.mockResolvedValueOnce({ data: null, issue: "unavailable" });
    html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ tab: "acessos" }) }));
    expect(html).toContain("Não foi possível consultar os integrantes");
  });
  it("não consulta dados para papel sem administração global", async () => {
    mocks.session.mockResolvedValue({ bearer: "private-bearer", roles: ["GESTOR_PROJETO"] });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Acesso restrito");
    expect(mocks.invitations).not.toHaveBeenCalled();
  });
});
