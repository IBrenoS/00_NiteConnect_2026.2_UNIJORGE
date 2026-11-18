import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ActivityPlanningPreview, getCompletionPercent, isValidPlanningTitle, movePreviewTask, PlanningForm, previewProjectOptions, type PreviewTask } from "./activity-planning-preview";

const task: PreviewTask = {
  id: 41,
  title: "Revisar a pauta",
  status: "Planejada",
  priority: "Alta",
  owner: "Você",
  start: "Sem data",
  due: "Sem prazo",
  description: "",
};

describe("dados demonstrativos das tarefas", () => {
  it("permite percorrer situações e prioridades em mudanças reversíveis", () => {
    const statusSequence = ["Em andamento", "Concluída", "Planejada"] as const;
    const prioritySequence = ["Baixa", "Média", "Alta"] as const;

    const finalStatus = statusSequence.reduce(
      (tasks, status) => movePreviewTask(tasks, task.id, "status", status),
      [task],
    );
    const finalPriority = prioritySequence.reduce(
      (tasks, priority) => movePreviewTask(tasks, task.id, "priority", priority),
      [task],
    );

    expect(finalStatus[0].status).toBe("Planejada");
    expect(finalPriority[0].priority).toBe("Alta");
    expect(task.status).toBe("Planejada");
    expect(task.priority).toBe("Alta");
  });

  it("recalcula conclusão sem considerar tarefas canceladas", () => {
    const tasks = [
      { ...task, status: "Concluída" as const },
      { ...task, id: 42, status: "Em andamento" as const },
      { ...task, id: 43, status: "Cancelada" as const },
    ];

    expect(getCompletionPercent(tasks)).toBe(50);
    expect(getCompletionPercent([])).toBe(0);
    expect(getCompletionPercent([{ ...task, status: "Cancelada" }])).toBe(0);
  });

  it("mantém a listagem em grade compacta com o cabeçalho solicitado", () => {
    const html = renderToStaticMarkup(createElement(ActivityPlanningPreview, { screen: "plannings", planningId: 1 }));

    expect(html).toContain("Minhas atividades");
    expect(html).toContain("grid-cols-2 xl:grid-cols-3");
    expect(html).not.toContain("Planejamentos acessíveis a você");
    expect(html).not.toContain("Abrir planejamento");
    expect(html).toContain('aria-label="Filtrar por projeto: Todos os projetos"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain("<select");
  });

  it("mostra a atividade vazia dentro do workspace e separa tasks legadas", () => {
    const html = renderToStaticMarkup(createElement(ActivityPlanningPreview, { screen: "empty", planningId: 4 }));

    expect(html).toContain("Acompanhamento do próximo ciclo");
    expect(html).toContain("Resumo");
    expect(html).toContain("Nova tarefa");
    expect(html).not.toContain("Organize o que vem a seguir");
    expect(html).not.toContain("Revisar atas do último encontro");
  });

  it("abre o registro de tarefa com responsável próprio e sem painel administrativo", () => {
    const html = renderToStaticMarkup(createElement(ActivityPlanningPreview, { screen: "task-form", planningId: 1 }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('value="Você"');
    expect(html).toContain("Início");
    expect(html).toContain("Prazo");
    expect(html).not.toContain("Criar ou editar tarefa");
  });
});

describe("criação de atividade no preview", () => {
  it("aceita somente títulos com conteúdo além de espaços", () => {
    expect(isValidPlanningTitle("")).toBe(false);
    expect(isValidPlanningTitle("  \t  ")).toBe(false);
    expect(isValidPlanningTitle("  Acolhimento  ")).toBe(true);
  });

  it("oferece projeto independente e os projetos demonstrativos elegíveis", () => {
    expect(previewProjectOptions).toEqual([null, "NITE Connect", "Portal do estudante"]);
  });

  it("usa título e descrição integrados, seletor contextual de projeto e ações do fluxo", () => {
    const html = renderToStaticMarkup(createElement(PlanningForm, { onClose: vi.fn(), onCreate: vi.fn() }));

    expect(html).toContain('placeholder="Nova atividade"');
    expect(html).toContain('placeholder="Adicione uma descrição..."');
    expect(html).toContain('aria-label="Projeto: Independente"');
    expect(html).toContain("<span>Projeto</span><span");
    expect(html).toContain("Independente");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("xl:top-[53px]");
    expect(html).toContain("xl:left-full");
    expect(html).toContain("xl:mt-[clamp(18rem,42vh,28rem)]");
    expect(html).toContain("items-center gap-6");
    expect(html).toContain("Cancelar");
    expect(html).toContain("Criar atividade");
    expect(html).not.toContain("Minhas atividades");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Buscar projeto");
    expect(html).not.toContain("Ver prévia");
  });
});
