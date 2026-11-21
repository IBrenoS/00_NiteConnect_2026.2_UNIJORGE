import { describe, expect, it, vi } from "vitest";
import { activityMutationIssueFromStatus, mutateActivity } from "./mutations";

vi.mock("server-only", () => ({}));

describe("classificação das respostas de mutação de atividade", () => {
  it("classifica HTTP 400 como entrada inválida", () => {
    expect(activityMutationIssueFromStatus(400)).toBe("invalid");
  });
  it("distingue a pausa de projeto de conflito de versão pelo código ProblemDetail", async () => {
    vi.stubEnv("API_BASE_URL", "http://localhost:8080");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ status: 409, code: "PROJECT_PAUSED" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ status: 409, detail: "Versão desatualizada" }, { status: 409 })));
    await expect(mutateActivity("/api/v1/activities/id/status", "bearer", "PATCH", {})).resolves.toEqual({ data: null, issue: "project-paused" });
    await expect(mutateActivity("/api/v1/activities/id/status", "bearer", "PATCH", {})).resolves.toEqual({ data: null, issue: "conflict" });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
