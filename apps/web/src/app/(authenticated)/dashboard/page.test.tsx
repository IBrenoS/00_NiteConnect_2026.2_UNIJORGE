import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), getContexts: vi.fn(), getOverview: vi.fn() }));

vi.mock("../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.requireSession }));
vi.mock("../../../lib/dashboard/overview-data", () => ({
  getDashboardContexts: mocks.getContexts,
  getDashboardOverview: mocks.getOverview,
}));

import DashboardPage from "./page";

const overview = (context: "PERSONAL" | "INSTITUTIONAL", from: string, to: string) => ({
  context, generatedAt: "2026-10-31T15:00:00Z", asOfDate: to, timeZone: "America/Bahia", from, to,
  current: {
    activities: { total: 0, planned: 0, inProgress: 0, completed: 0, cancelled: 0, overdue: 0, attentionRequired: 0, dueSoon: 0 },
    projects: [], projectHealth: [],
  },
  risks: { total: 0, items: [] }, evolution: [], actions: { total: 0, items: [] },
  projects: { total: 0, items: [] }, commitments: { total: 0, items: [] },
  administrative: context === "INSTITUTIONAL" ? { pendingProposals: 0, pendingInvitations: 0, failedInvitations: 0, openAttendanceLists: 0 } : null,
  unavailable: [],
});

function viewProps(page: unknown): Record<string, unknown> {
  if (!isValidElement<Record<string, unknown>>(page)) throw new Error("A rota não retornou DashboardOverviewView.");
  return page.props;
}

describe("rota autenticada da Visão Geral", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T15:00:00Z"));
    mocks.requireSession.mockResolvedValue({
      member: { id: "member-1", name: "Pessoa", institutionalEmail: "person@example.invalid", status: "ATIVO" },
      roles: ["INTEGRANTE"], bearer: "server-only-bearer",
    });
    mocks.getContexts.mockResolvedValue({ data: ["PERSONAL"], issue: null });
    mocks.getOverview.mockImplementation((_bearer: string, context: "PERSONAL" | "INSTITUTIONAL", from: string, to: string) => ({ data: overview(context, from, to), issue: null }));
  });

  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("inicia no contexto pessoal e não consulta institucional para integrante", async () => {
    const page = await DashboardPage({ searchParams: Promise.resolve({ context: "institutional", period: "7" }) });
    const props = viewProps(page);
    expect(props.context).toBe("personal");
    expect(props.allowedContexts).toEqual(["PERSONAL"]);
    expect(mocks.getOverview).toHaveBeenCalledExactlyOnceWith("server-only-bearer", "PERSONAL", "2026-10-25", "2026-10-31");
  });

  it.each(["GESTOR_GERAL", "COORDENADOR"])("permite contexto institucional a %s somente quando a API o autoriza", async (role) => {
    mocks.requireSession.mockResolvedValue({ member: {}, roles: [role], bearer: "server-only-bearer" });
    mocks.getContexts.mockResolvedValue({ data: ["PERSONAL", "INSTITUTIONAL"], issue: null });
    const page = await DashboardPage({ searchParams: Promise.resolve({ context: "institutional", period: "90" }) });
    const props = viewProps(page);
    expect(props.context).toBe("institutional");
    expect(mocks.getOverview).toHaveBeenCalledExactlyOnceWith("server-only-bearer", "INSTITUTIONAL", "2026-08-03", "2026-10-31");
  });

  it("mantém gestor de projeto e URL inválida no contexto pessoal", async () => {
    mocks.requireSession.mockResolvedValue({ member: {}, roles: ["GESTOR_PROJETO"], bearer: "server-only-bearer" });
    mocks.getContexts.mockResolvedValue({ data: ["PERSONAL"], issue: null });
    const page = await DashboardPage({ searchParams: Promise.resolve({ context: "project:expired-id", period: "custom" }) });
    const props = viewProps(page);
    expect(props.context).toBe("personal");
    expect(props.period).toBe("30");
    expect(mocks.getOverview).toHaveBeenCalledExactlyOnceWith("server-only-bearer", "PERSONAL", "2026-10-02", "2026-10-31");
  });

  it("respeita contextos negados pela API mesmo quando a sessão conserva papel administrativo", async () => {
    mocks.requireSession.mockResolvedValue({ member: {}, roles: ["GESTOR_GERAL"], bearer: "server-only-bearer" });
    mocks.getContexts.mockResolvedValue({ data: ["PERSONAL"], issue: null });
    const page = await DashboardPage({ searchParams: Promise.resolve({ context: "institutional" }) });
    expect(viewProps(page).context).toBe("personal");
    expect(mocks.getOverview).toHaveBeenCalledExactlyOnceWith("server-only-bearer", "PERSONAL", "2026-10-02", "2026-10-31");
  });

  it("cai para pessoal sem renderizar dados institucionais se o endpoint negar acesso", async () => {
    mocks.requireSession.mockResolvedValue({ member: {}, roles: ["GESTOR_GERAL"], bearer: "server-only-bearer" });
    mocks.getContexts.mockResolvedValue({ data: ["PERSONAL", "INSTITUTIONAL"], issue: null });
    mocks.getOverview.mockResolvedValueOnce({ data: null, issue: "access" });
    const page = await DashboardPage({ searchParams: Promise.resolve({ context: "institutional" }) });
    const props = viewProps(page);
    expect(props.context).toBe("personal");
    expect(props.allowedContexts).toEqual(["PERSONAL"]);
    expect(mocks.getOverview).toHaveBeenNthCalledWith(2, "server-only-bearer", "PERSONAL", "2026-10-02", "2026-10-31");
  });

  it("não consulta indicadores se não conseguir confirmar contextos autorizados", async () => {
    mocks.getContexts.mockResolvedValue({ data: null, issue: "unavailable" });
    const page = await DashboardPage({ searchParams: Promise.resolve({}) });
    const props = viewProps(page);
    expect(props.contextIssue).toBe("unavailable");
    expect(mocks.getOverview).not.toHaveBeenCalled();
  });

  it("rejeita resposta com período ou contexto diferente do solicitado", async () => {
    mocks.getOverview.mockResolvedValue({ data: overview("INSTITUTIONAL", "2026-10-02", "2026-10-31"), issue: null });
    const page = await DashboardPage({ searchParams: Promise.resolve({ context: "personal" }) });
    expect(viewProps(page).result).toEqual({ data: null, issue: "invalid" });
  });
});
