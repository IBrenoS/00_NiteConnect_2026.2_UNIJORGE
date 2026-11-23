import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardOverview } from "../../lib/dashboard/overview-contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

import { DashboardOverviewView } from "./dashboard-overview";

const taskId = "b0000000-0000-4000-8000-000000000001";
const projectId = "b0000000-0000-4000-8000-000000000002";

function data(context: "PERSONAL" | "INSTITUTIONAL" = "PERSONAL"): DashboardOverview {
  return {
    context, generatedAt: "2026-11-22T15:00:00Z", asOfDate: "2026-11-22", timeZone: "America/Bahia", from: "2026-11-16", to: "2026-11-22",
    current: {
      activities: { total: 2, planned: 1, inProgress: 1, completed: 0, cancelled: 0, overdue: 1, attentionRequired: 1, dueSoon: 0 },
      projects: [{ situation: "ATIVO", total: 1 }], projectHealth: [{ situation: "ATENCAO", total: 1 }],
    },
    risks: { total: 1, items: [{ projectId, title: "Projeto atual", health: "ATENCAO", maxOverdueDays: 3, reason: "Atraso", href: `/projetos/${projectId}` }] },
    evolution: [{ day: "2026-11-20", source: "ACTIVITY", event: "CREATED", total: 2 }, { day: "2026-11-21", source: "PROJECT", event: "ATIVO", total: 1 }],
    actions: { total: 1, items: [{ activityId: taskId, title: "Tarefa real", priority: "ALTA", dueOn: "2026-11-21", projectId,
      linkKinds: ["EXECUTOR"], overdue: true, dueSoon: false, href: `/atividades/${taskId}` }] },
    projects: { total: 1, items: [{ projectId, title: "Projeto atual", situation: "ATIVO", leader: false, openActivities: 1, href: `/projetos/${projectId}` }] },
    commitments: { total: 0, items: [] },
    administrative: context === "INSTITUTIONAL" ? { pendingProposals: 1, pendingInvitations: 2, failedInvitations: 0, openAttendanceLists: 1 } : null,
    unavailable: [],
  };
}

function render(context: "personal" | "institutional", response: DashboardOverview, showLeadership = false) {
  return renderToStaticMarkup(<DashboardOverviewView context={context} allowedContexts={["PERSONAL", "INSTITUTIONAL"]}
    period="7" from="2026-11-16" to="2026-11-22" result={{ data: response, issue: null }} contextIssue={null} showLeadership={showLeadership} />);
}

describe("composição integrada da Visão Geral", () => {
  it("preserva a composição pessoal com dados atuais, links canônicos e eventos reais", () => {
    const html = render("personal", data());
    expect(html).toContain("Precisa da sua atenção");
    expect(html).toContain("Atividades criadas");
    expect(html).toContain("href=\"/atividades/" + taskId + "\"");
    expect(html).toContain("href=\"/projetos/" + projectId + "\"");
    expect(html).toContain("Atrasada");
    expect(html).not.toContain("Sob minha liderança");
    expect(html).not.toContain("PRÉVIA 09.0B");
    expect(html).not.toContain("demonstração");
  });

  it("exibe liderança vigente sem inferir acesso administrativo", () => {
    const withLeadership = data();
    const project = withLeadership.projects.items[0];
    if (project) project.leader = true;
    const html = render("personal", withLeadership, true);
    expect(html).toContain("Sob minha liderança");
    expect(html).toContain("Liderança vigente");
    expect(html).not.toContain("Pendências administrativas");
  });

  it("mostra estado vazio para gestor de projeto sem liderança vigente", () => {
    const withoutLeadership = data();
    withoutLeadership.projects = { total: 0, items: [] };
    withoutLeadership.current.projects = [];
    withoutLeadership.current.projectHealth = [];
    withoutLeadership.risks = { total: 0, items: [] };
    const html = render("personal", withoutLeadership, true);
    expect(html).toContain("Sob minha liderança");
    expect(html).toContain("Nenhuma liderança vigente nos projetos retornados.");
  });

  it("preserva dados insuficientes e indicadores administrativos agregados", () => {
    const institutional = data("INSTITUTIONAL");
    institutional.current.projectHealth = [{ situation: "DADOS_INSUFICIENTES", total: 1 }];
    institutional.risks = { total: 0, items: [] };
    const html = render("institutional", institutional);
    expect(html).toContain("Dados insuficientes");
    expect(html).toContain("Pendências administrativas");
    expect(html).toContain("Convites aguardando resposta");
    expect(html).toContain("<strong>4</strong>");
  });

  it("mostra vazio adequado e falha parcial sem transformar indisponibilidade em zero", () => {
    const empty = data("INSTITUTIONAL");
    empty.evolution = [];
    empty.administrative = null;
    const html = render("institutional", empty);
    expect(html).toContain("Sem eventos registrados no período selecionado.");
    expect(html).toContain("Indicadores administrativos indisponíveis");
  });

  it("permite visão geral institucional sem projetos vinculados ao usuário", () => {
    const withoutMembership = data("INSTITUTIONAL");
    withoutMembership.projects = { total: 0, items: [] };
    withoutMembership.current.projects = [];
    withoutMembership.current.projectHealth = [];
    withoutMembership.risks = { total: 0, items: [] };
    const html = render("institutional", withoutMembership);
    expect(html).toContain("Visão geral do NITE");
    expect(html).toContain("Nenhum projeto para classificar.");
    expect(html).toContain("Nenhum risco de saúde atual foi identificado.");
  });
});
