import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getApiJson: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../api/server", () => ({ getApiJson: mocks.getApiJson }));

import {
  getCollectiveFrequencySummary,
  getCollectiveMemberHistory,
  getFrequencyParticipants,
  getPersonalFrequencyHistory,
  getPersonalOpenLists,
  getPersonalFrequencySummary,
} from "./data";

describe("consultas de Frequência", () => {
  afterEach(() => mocks.getApiJson.mockReset());

  it("consulta resumo pessoal por mês ou semestre com identidade autenticada", async () => {
    mocks.getApiJson.mockResolvedValue({ data: null, issue: null });
    await getPersonalFrequencySummary("bearer", "2026-07-01", "2026-12-31", "SEMESTER");
    const [path, bearer] = mocks.getApiJson.mock.calls[0] as [string, string];
    const url = new URL(path, "https://nite.example.org");
    expect(url.pathname).toBe("/api/v1/me/frequency/summary");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: "2026-07-01", to: "2026-12-31", groupBy: "SEMESTER" });
    expect(bearer).toBe("bearer");
  });

  it("página o histórico pessoal e envia o intervalo civil escolhido", async () => {
    mocks.getApiJson.mockResolvedValue({ data: null, issue: null });
    await getPersonalFrequencyHistory("bearer", "2026-11-01", "2026-11-30", 2);
    const [path] = mocks.getApiJson.mock.calls[0] as [string, string];
    const url = new URL(path, "https://nite.example.org");
    expect(url.pathname).toBe("/api/v1/me/frequency/history");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: "2026-11-01", to: "2026-11-30", page: "2", size: "20" });
  });

  it("consulta listas abertas pessoais sem enviar dados de confirmação", async () => {
    mocks.getApiJson.mockResolvedValue({ data: [], issue: null });
    await getPersonalOpenLists("bearer");
    expect(mocks.getApiJson).toHaveBeenCalledWith("/api/v1/me/frequency/open-lists", "bearer", expect.any(Function));
  });

  it("consulta lista coletiva com busca remota e histórico da pessoa selecionada", async () => {
    mocks.getApiJson.mockResolvedValue({ data: null, issue: null });
    await getCollectiveFrequencySummary("bearer", "2026-01-01", "2026-06-30", 1, "João");
    await getCollectiveMemberHistory("bearer", "member/id", "2026-01-01", "2026-06-30", 3);
    await getFrequencyParticipants("bearer", "list/id", 2, "PRESENTE", "Ana");
    const summary = new URL(mocks.getApiJson.mock.calls[0]?.[0] as string, "https://nite.example.org");
    const history = new URL(mocks.getApiJson.mock.calls[1]?.[0] as string, "https://nite.example.org");
    const participants = new URL(mocks.getApiJson.mock.calls[2]?.[0] as string, "https://nite.example.org");
    expect(summary.pathname).toBe("/api/v1/attendance/frequency/summary");
    expect(Object.fromEntries(summary.searchParams)).toEqual({ from: "2026-01-01", to: "2026-06-30", page: "1", size: "50", name: "João" });
    expect(history.pathname).toBe("/api/v1/attendance/frequency/members/member%2Fid/history");
    expect(Object.fromEntries(history.searchParams)).toEqual({ from: "2026-01-01", to: "2026-06-30", page: "3", size: "50" });
    expect(participants.pathname).toBe("/api/v1/attendance/lists/list%2Fid/participants");
    expect(Object.fromEntries(participants.searchParams)).toEqual({ page: "2", size: "50", status: "PRESENTE", name: "Ana" });
  });
});
