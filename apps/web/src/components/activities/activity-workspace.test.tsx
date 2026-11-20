import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { previewActivities, previewProjectTitles } from "../../lib/activities/preview-fixtures";
import type { ActivityCapabilities } from "../../lib/activities/contracts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../lib/activities/actions", () => ({ moveActivityAction: vi.fn() }));

import { ActivityWorkspace } from "./activity-workspace";

const capabilities: ActivityCapabilities = {
  edit: true,
  changePriority: true,
  canDelete: false,
  transitions: ["EM_EXECUCAO", "CONCLUIDA"],
  history: true,
  manageAssignees: false,
  addEvidence: false,
  upload: false,
};
const capabilityMap = Object.fromEntries(previewActivities.map((activity) => [activity.id, capabilities]));
const props = {
  activities: previewActivities,
  projectTitles: previewProjectTitles,
  capabilities: capabilityMap,
  returnTo: "/atividades?view=status",
} as const;

describe("vistas pessoais de atividades", () => {
  it("explica o bloqueio de projeto pausado e só oferece retomada a quem pode fazê-la", () => {
    const activity = previewActivities.find((item) => item.projectId !== null);
    if (!activity) throw new Error("Atividade de projeto indisponível");
    const pausedCapabilities = { ...capabilities, transitions: [], executionBlockedByProjectPause: true, canResumeProject: false };
    const withoutResume = renderToStaticMarkup(<ActivityWorkspace {...props} activities={[activity]} capabilities={{ [activity.id]: pausedCapabilities }} view="status"/>);
    expect(withoutResume).toContain("Atividades de projetos pausados não podem mudar de situação");
    expect(withoutResume).toContain("peça a um administrador para retomar o projeto");
    expect(withoutResume).not.toContain("retome o projeto em Administração");
    const withResume = renderToStaticMarkup(<ActivityWorkspace {...props} activities={[activity]} capabilities={{ [activity.id]: { ...pausedCapabilities, canResumeProject: true } }} view="priority"/>);
    expect(withResume).toContain("retome o projeto em Administração");
  });

  it("agrupa os cards nas quatro situações e mantém propriedades editáveis acessíveis", () => {
    const html = renderToStaticMarkup(<ActivityWorkspace {...props} view="status" />);

    expect(html).toContain("Quadro por situação");
    expect(html).toContain("Planejadas");
    expect(html).toContain("Em execução");
    expect(html).toContain("Concluídas");
    expect(html).toContain("Canceladas");
    expect(html).toContain("Arraste para mover");
    expect(html).toContain("Alterar situação de Preparar roteiro para a próxima reunião de orientação");
    expect(html).toContain("Alterar prioridade de Preparar roteiro para a próxima reunião de orientação");
  });

  it("agrupa por prioridade com a coluna sem prioridade", () => {
    const html = renderToStaticMarkup(<ActivityWorkspace {...props} view="priority" />);

    expect(html).toContain("Quadro por prioridade");
    expect(html).toContain("Sem prioridade");
    expect(html).toContain("Alta");
    expect(html).toContain("Média");
    expect(html).toContain("Baixa");
  });

  it("exibe a vista em tabela com propriedades alinhadas em colunas", () => {
    const html = renderToStaticMarkup(<ActivityWorkspace {...props} view="list" />);

    expect(html).toContain("<table");
    expect(html).toContain("Situação");
    expect(html).toContain("Prioridade");
    expect(html).toContain("Projeto");
    expect(html).toContain("Início");
    expect(html).toContain("Prazo");
  });
});
