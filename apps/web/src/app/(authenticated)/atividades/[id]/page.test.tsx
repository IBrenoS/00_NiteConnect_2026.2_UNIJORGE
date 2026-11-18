import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewActivities } from "../../../../lib/activities/preview-fixtures";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getActivity: vi.fn(),
  getActivityAssignees: vi.fn(),
  getActivityCandidates: vi.fn(),
  getActivityCapabilities: vi.fn(),
  getActivityEvidence: vi.fn(),
  getActivityHistory: vi.fn(),
  getAllMyProjects: vi.fn(),
  getEvidenceCapabilities: vi.fn(),
}));

vi.mock("../../../../lib/auth/server-session", () => ({ requireAuthenticatedNiteSession: mocks.requireSession }));
vi.mock("../../../../lib/activities/data", () => ({
  getActivity: mocks.getActivity,
  getActivityAssignees: mocks.getActivityAssignees,
  getActivityCandidates: mocks.getActivityCandidates,
  getActivityCapabilities: mocks.getActivityCapabilities,
  getActivityEvidence: mocks.getActivityEvidence,
  getActivityHistory: mocks.getActivityHistory,
  getAllMyProjects: mocks.getAllMyProjects,
  getEvidenceCapabilities: mocks.getEvidenceCapabilities,
}));
vi.mock("../../../../components/activities/activity-detail", () => ({ ActivityDetail: () => null }));

import ActivityDetailPage from "./page";

const activity = previewActivities[0];
const emptyPage = { items: [], page: 0, size: 20, total: 0 };

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  return ActivityDetailPage({ params: Promise.resolve({ id: activity.id }), searchParams: Promise.resolve(searchParams) });
}

describe("rota do detalhe de atividade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ bearer: "server-only", member: { id: "member-1" } });
    mocks.getActivity.mockResolvedValue({ data: activity, issue: null });
    mocks.getActivityAssignees.mockResolvedValue({ data: { ...emptyPage, size: 100 }, issue: null });
    mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: true, changePriority: true, canDelete: false, transitions: [], history: false, manageAssignees: true, addEvidence: false, upload: false }, issue: null });
    mocks.getActivityEvidence.mockResolvedValue({ data: emptyPage, issue: null });
    mocks.getActivityCandidates.mockResolvedValue({ data: emptyPage, issue: null });
    mocks.getAllMyProjects.mockResolvedValue({ data: [], issue: null });
  });

  it("não consulta candidatos nem expande participantes no detalhe inicial", async () => {
    const page = await renderPage();

    expect(mocks.getActivityCandidates).not.toHaveBeenCalled();
    expect(isValidElement<Record<string, unknown>>(page)).toBe(true);
    if (!isValidElement<Record<string, unknown>>(page)) throw new Error("A rota não retornou ActivityDetail.");
    expect(page.props.candidates).toBeNull();
    expect(page.props.candidateIssue).toBeNull();
    expect(page.props.participantsOpen).toBe(false);
  });

  it("não consulta candidatos até receber uma busca compatível com o contrato", async () => {
    const panel = await renderPage({ participants: "1" });
    expect(mocks.getActivityCandidates).not.toHaveBeenCalled();
    expect(isValidElement<Record<string, unknown>>(panel)).toBe(true);
    if (!isValidElement<Record<string, unknown>>(panel)) throw new Error("A rota não retornou ActivityDetail.");
    expect(panel.props.candidates).toBeNull();
    expect(panel.props.candidateIssue).toBeNull();

    const page = await renderPage({ participants: "1", candidatePage: "2", candidateQ: "Ana" });

    expect(mocks.getActivityCandidates).toHaveBeenCalledWith("server-only", activity.id, { page: 2, q: "Ana" });
    expect(isValidElement<Record<string, unknown>>(page)).toBe(true);
    if (!isValidElement<Record<string, unknown>>(page)) throw new Error("A rota não retornou ActivityDetail.");
    expect(page.props.participantsOpen).toBe(true);
    expect(page.props.candidates).toEqual(emptyPage);
  });

  it("não consulta candidatos quando a capacidade não foi autorizada", async () => {
    mocks.getActivityCapabilities.mockResolvedValue({ data: { edit: false, changePriority: false, canDelete: false, transitions: [], history: false, manageAssignees: false, addEvidence: false, upload: false }, issue: null });

    await renderPage({ participants: "1" });

    expect(mocks.getActivityCandidates).not.toHaveBeenCalled();
  });

  it("valida a busca curta sem consultar a API", async () => {
    const page = await renderPage({ participants: "1", candidateQ: "A" });

    expect(mocks.getActivityCandidates).not.toHaveBeenCalled();
    expect(isValidElement<Record<string, unknown>>(page)).toBe(true);
    if (!isValidElement<Record<string, unknown>>(page)) throw new Error("A rota não retornou ActivityDetail.");
    expect(page.props.candidateSearchInvalid).toBe(true);
  });
});
