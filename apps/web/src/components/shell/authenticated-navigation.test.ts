import { describe, expect, it } from "vitest";
import { buildAuthenticatedNavigationGroups } from "./authenticated-navigation";

const base = {
  projects: [],
  canAdminister: false,
  canCoordinate: false,
};

describe("navegação autenticada", () => {
  it("liga as rotas integradas e sinaliza módulos sem página", () => {
    const groups = buildAuthenticatedNavigationGroups(base);
    const items = groups.flatMap(({ items: groupItems }) => groupItems);

    expect(groups.map(({ label }) => label)).toEqual(["Início", "Meu espaço"]);
    expect(items.filter(({ href }) => href).map(({ href }) => href)).toEqual(["/dashboard", "/atividades", "/reunioes", "/frequencia", "/documentos"]);
    expect(groups.find(({ label }) => label === "Meu espaço")?.items.map(({ label }) => label)).toEqual([
      "Minhas atividades", "Meus projetos", "Reuniões", "Frequência", "Meus documentos",
    ]);
    expect(items.find(({ label }) => label === "Reuniões")).toMatchObject({ href: "/reunioes" });
    expect(items.find(({ label }) => label === "Frequência")).toMatchObject({ href: "/frequencia" });
    expect(items.some(({ label }) => label === "Minha participação")).toBe(false);
    expect(items.every(({ href, status }) => href || status === "development")).toBe(true);
    expect(items.some(({ href }) => href?.includes("#") || href?.includes("scope="))).toBe(false);
  });

  it("mostra a área de projetos apenas quando há contextos de liderança autorizados", () => {
    const groups = buildAuthenticatedNavigationGroups({
      ...base,
      projects: [{ projectId: "project-1", title: "Projeto de teste" }],
    });
    const projects = groups.find(({ label }) => label === "Projetos que lidero");

    expect(projects?.note).toContain("visão no painel");
    expect(projects?.items.every(({ href, status }) => !href && status === "development")).toBe(true);
    expect(groups.flatMap(({ items: groupItems }) => groupItems).some(({ label }) => label === "Prioridades")).toBe(false);
  });

  it("exibe áreas institucionais e acadêmicas conforme os papéis recebidos", () => {
    const groups = buildAuthenticatedNavigationGroups({
      ...base,
      canAdminister: true,
      canCoordinate: true,
    });

    expect(groups.map(({ label }) => label)).toEqual([
      "Início",
      "Meu espaço",
      "Acompanhamento do NITE",
      "Administração",
      "Acompanhamento acadêmico",
    ]);
    expect(groups.flatMap(({ items: groupItems }) => groupItems).filter(({ href }) => href).map(({ href }) => href)).toEqual(["/dashboard", "/atividades", "/reunioes", "/frequencia", "/documentos"]);
    expect(groups.flatMap(({ items: groupItems }) => groupItems).filter(({ label }) => label === "Frequência")).toHaveLength(1);
  });
});
