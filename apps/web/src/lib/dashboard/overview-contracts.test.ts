import { describe, expect, it } from "vitest";
import { parseDashboardContexts, parseDashboardOverview } from "./overview-contracts";

const projectId = "a0000000-0000-4000-8000-000000000001";
const activityId = "a0000000-0000-4000-8000-000000000002";
const overview = {
  context: "PERSONAL",
  generatedAt: "2026-11-22T15:00:00Z",
  asOfDate: "2026-11-22",
  timeZone: "America/Bahia",
  from: "2026-11-16",
  to: "2026-11-22",
  current: {
    activities: { total: 3, planned: 1, inProgress: 1, completed: 1, cancelled: 0, overdue: 1, attentionRequired: 1, dueSoon: 2 },
    projects: [{ situation: "ATIVO", total: 1 }],
    projectHealth: [{ situation: "DADOS_INSUFICIENTES", total: 1 }],
  },
  risks: { total: 0, items: [] },
  evolution: [
    { day: "2026-11-20", source: "ACTIVITY", event: "CREATED", total: 1 },
    { day: "2026-11-21", source: "ACTIVITY", event: "STATUS_CHANGED", total: 2 },
    { day: "2026-11-22", source: "PROJECT", event: "ATIVO", total: 1 },
  ],
  actions: { total: 1, items: [{
    activityId, title: "Revisar plano", priority: "ALTA", dueOn: "2026-11-21", projectId,
    linkKinds: ["EXECUTOR"], overdue: true, dueSoon: false, href: `/atividades/${activityId}`,
  }] },
  projects: { total: 1, items: [{
    projectId, title: "Projeto atual", situation: "ATIVO", leader: true, openActivities: 2, href: `/projetos/${projectId}`,
  }] },
  commitments: { total: 1, items: [{
    id: "a0000000-0000-4000-8000-000000000003", source: "MEETING", title: "Alinhamento", startsAt: "2026-11-23T13:00:00Z", href: "/reunioes",
  }] },
  administrative: null,
  unavailable: [{ indicator: "productivity", reason: "Não há indicador persistido." }],
};

describe("contratos da Visão Geral 09.0A", () => {
  it("aceita somente contextos conhecidos e remove duplicatas", () => {
    expect(parseDashboardContexts(["PERSONAL", "INSTITUTIONAL", "PERSONAL"])).toEqual(["PERSONAL", "INSTITUTIONAL"]);
    expect(parseDashboardContexts(["PROJECT"])).toBeNull();
    expect(parseDashboardContexts({ items: ["PERSONAL"] })).toBeNull();
  });

  it("valida resposta pessoal, preserva eventos e links canônicos", () => {
    const parsed = parseDashboardOverview(overview);
    expect(parsed?.current.activities.attentionRequired).toBe(1);
    expect(parsed?.evolution).toEqual(overview.evolution);
    expect(parsed?.actions.items[0]?.href).toBe(`/atividades/${activityId}`);
    expect(parsed?.projects.items[0]?.leader).toBe(true);
    expect(parsed?.administrative).toBeNull();
    expect(parsed?.unavailable[0]?.indicator).toBe("productivity");
  });

  it("preserva ausência de atualizações como dado insuficiente, não como regular", () => {
    expect(parseDashboardOverview(overview)?.current.projectHealth).toEqual([{ situation: "DADOS_INSUFICIENTES", total: 1 }]);
  });

  it("rejeita links não canônicos, contagens inválidas e eventos fora do período", () => {
    const externalLink = structuredClone(overview);
    Reflect.set(externalLink.actions.items[0], "href", "https://example.invalid/atividade");
    expect(parseDashboardOverview(externalLink)).toBeNull();

    const negativeCount = structuredClone(overview);
    Reflect.set(negativeCount.current.activities, "total", -1);
    expect(parseDashboardOverview(negativeCount)).toBeNull();

    const noEventPeriod = structuredClone(overview);
    Reflect.set(noEventPeriod.evolution[0], "day", "2026-11-01");
    expect(parseDashboardOverview(noEventPeriod)).toBeNull();
  });
});
