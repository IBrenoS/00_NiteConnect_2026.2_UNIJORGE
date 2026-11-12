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

    expect(groups.map(({ label }) => label)).toEqual(["Início", "Meu espaço", "Núcleo"]);
    expect(items.filter(({ href }) => href).map(({ href }) => href)).toEqual(["/dashboard", "/atividades", "/meus-projetos", "/reunioes", "/frequencia", "/documentos"]);
    expect(groups.find(({ label }) => label === "Meu espaço")?.items.map(({ label }) => label)).toEqual([
      "Minhas atividades", "Meus projetos", "Reuniões", "Frequência", "Meus arquivos",
    ]);
    expect(items.find(({ label }) => label === "Reuniões")).toMatchObject({ href: "/reunioes" });
    expect(items.find(({ label }) => label === "Frequência")).toMatchObject({ href: "/frequencia" });
    expect(items.some(({ label }) => label === "Minha participação")).toBe(false);
    expect(items.every(({ href, status }) => href || status === "development")).toBe(true);
    expect(items.some(({ href }) => href?.includes("#") || href?.includes("scope="))).toBe(false);
  });

  it("mantém a gestão do projeto no workspace, sem menu de liderança paralelo", () => {
    const groups = buildAuthenticatedNavigationGroups({...base,projects:[{projectId:"project-1",title:"Projeto de teste"}]});
    expect(groups.some(({label})=>label==="Projetos que lidero")).toBe(false);
    expect(groups.find(({label})=>label==="Núcleo")?.items[0].label).toBe("Projetos");
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
      "Núcleo",
      "Gestão do NITE",
      "Acompanhamento acadêmico",
    ]);
    expect(groups.flatMap(({ items: groupItems }) => groupItems).filter(({ href }) => href).map(({ href }) => href)).toEqual(["/dashboard", "/atividades", "/meus-projetos", "/reunioes", "/frequencia", "/documentos", "/biblioteca"]);
    expect(groups.flatMap(({ items: groupItems }) => groupItems).filter(({ label }) => label === "Frequência")).toHaveLength(1);
  });
});
