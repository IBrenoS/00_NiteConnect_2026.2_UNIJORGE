import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, revalidatePath, getActivity, getActivityCapabilities, getActivityEvidenceById, getEvidenceCapabilities, mutateActivity } = vi.hoisted(() => ({
  redirect: vi.fn((location: string): never => { throw new Error(`redirect:${location}`); }),
  revalidatePath: vi.fn(),
  getActivity: vi.fn(),
  getActivityCapabilities: vi.fn(),
  getActivityEvidenceById: vi.fn(),
  getEvidenceCapabilities: vi.fn(),
  mutateActivity: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./data", () => ({ getActivity, getActivityCapabilities, getActivityEvidenceById, getEvidenceCapabilities }));
vi.mock("./mutations", () => ({ mutateActivity, uploadActivityEvidence: vi.fn() }));
vi.mock("../auth/server-session", () => ({
  getAuthenticatedNiteSession: vi.fn(async () => ({ bearer: "test-bearer", member: { id: "member-1" } })),
}));

import { moveActivityAction, updateActivityAction, withdrawActivityEvidenceAction } from "./actions";
import { previewActivities } from "./preview-fixtures";
import { parseActivity } from "./contracts";

const activityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const evidenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function updateForm(): FormData {
  const form = new FormData();
  form.set("title", "Atividade revisada");
  form.set("description", "Descrição válida");
  form.set("reason", "Ajuste solicitado");
  form.set("expectedVersion", "1");
  return form;
}

describe("ações de atividades", () => {
  it("retorna o estado canônico com nova versão após mover na vista legada", async () => {
    const activity = previewActivities[0];
    const updated = { ...activity, priority: "BAIXA", version: activity.version + 1 };
    getActivity.mockResolvedValue({ data: activity, issue: null });
    getActivityCapabilities.mockResolvedValue({ data: { changePriority: true }, issue: null });
    mutateActivity.mockResolvedValue({ data: updated, issue: null });
    const result = await moveActivityAction(activity.id, activity.version, "priority", "BAIXA");
    expect(result).toEqual({ issue: null, activity: updated });
    expect(mutateActivity).toHaveBeenCalledWith(`/api/v1/activities/${activity.id}`, "test-bearer", "PATCH", { priority: "BAIXA", expectedVersion: activity.version }, parseActivity);
  });
  beforeEach(() => {
    getActivityCapabilities.mockReset();
    getActivityEvidenceById.mockReset();
    getEvidenceCapabilities.mockReset();
    mutateActivity.mockReset();
    redirect.mockClear();
  });

  it.each([
    ["unavailable", "unavailable"],
    ["not-found", "not-found"],
    ["invalid", "invalid"],
    ["access", "forbidden"],
  ] as const)("preserva falha de capacidades %s como feedback %s", async (issue, feedback) => {
    getActivityCapabilities.mockResolvedValue({ data: null, issue });

    await expect(updateActivityAction(activityId, updateForm())).rejects.toThrow("redirect:");

    expect(redirect).toHaveBeenCalledWith(expect.stringContaining(`feedback=${feedback}`));
    expect(mutateActivity).not.toHaveBeenCalled();
  });

  it("não retira evidência sem confirmação enviada pelo formulário", async () => {
    getActivityEvidenceById.mockResolvedValue({ data: { withdrawnAt: null }, issue: null });
    getEvidenceCapabilities.mockResolvedValue({ data: { withdraw: true }, issue: null });
    const form = new FormData();
    form.set("expectedVersion", "1");
    form.set("reason", "Retirada solicitada");

    await expect(withdrawActivityEvidenceAction(activityId, evidenceId, form)).rejects.toThrow("redirect:");

    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("feedback=invalid"));
    expect(mutateActivity).not.toHaveBeenCalled();
    expect(getActivityEvidenceById).not.toHaveBeenCalled();
  });

  it("envia a retirada quando a confirmação explícita está presente", async () => {
    getActivityEvidenceById.mockResolvedValue({ data: { withdrawnAt: null }, issue: null });
    getEvidenceCapabilities.mockResolvedValue({ data: { withdraw: true }, issue: null });
    mutateActivity.mockResolvedValue({ data: null, issue: null });
    const form = new FormData();
    form.set("expectedVersion", "1");
    form.set("reason", "Retirada solicitada");
    form.set("confirmed", "true");

    await expect(withdrawActivityEvidenceAction(activityId, evidenceId, form)).rejects.toThrow("redirect:");

    expect(mutateActivity).toHaveBeenCalledWith(
      `/api/v1/activities/${activityId}/evidence/${evidenceId}/withdraw`,
      "test-bearer",
      "POST",
      { expectedVersion: 1, reason: "Retirada solicitada", confirmed: true },
    );
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("feedback=withdrawn"));
  });
});
