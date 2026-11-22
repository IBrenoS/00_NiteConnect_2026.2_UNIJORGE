import { describe, expect, it } from "vitest";
import { buildAuthenticatedNavigationGroups, isAuthenticatedNavigationItemCurrent } from "./authenticated-navigation";

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
    expect(items.filter(({ href }) => href).map(({ href }) => href)).toEqual(["/dashboard", "/atividades", "/meus-projetos", "/reunioes", "/frequencia", "/documentos", "/documentos/lixeira", "/projetos"]);
    expect(groups.find(({ label }) => label === "Meu espaço")?.items.map(({ label }) => label)).toEqual([
      "Minhas atividades", "Meus projetos", "Reuniões", "Frequência", "Meus arquivos", "Lixeira",
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
    expect(groups.flatMap(({ items: groupItems }) => groupItems).filter(({ href }) => href).map(({ href }) => href)).toEqual(["/dashboard", "/atividades", "/meus-projetos", "/reunioes", "/frequencia", "/documentos", "/documentos/lixeira", "/projetos", "/gestao/atividades-e-entregas", "/relatorios", "/biblioteca", "/gestao/integrantes", "/gestao/acessos-e-convites"]);
    expect(groups.flatMap(({ items: groupItems }) => groupItems).find(({label})=>label==="Atividades e entregas")).toMatchObject({href:"/gestao/atividades-e-entregas"});
    expect(groups.flatMap(({ items: groupItems }) => groupItems).filter(({ label }) => label === "Frequência")).toHaveLength(1);
  });

  it("usa um ícone distinto para cada destino principal", () => {
    const groups = buildAuthenticatedNavigationGroups({ ...base, canAdminister: true });
    const iconByLabel = Object.fromEntries(groups.flatMap(({ items }) => items.map(({ label, icon }) => [label, icon])));

    expect(iconByLabel).toMatchObject({
      "Visão geral": "dashboard",
      "Minhas atividades": "checklist",
      "Meus projetos": "cards",
      "Reuniões": "video",
      "Frequência": "clock",
      "Meus arquivos": "folder",
      "Lixeira": "trash",
      "Projetos": "network",
      "Atividades e entregas": "inbox",
      "Relatórios": "chart",
      "Biblioteca do NITE": "books",
      "Integrantes": "people",
      "Acessos e convites": "invite",
      "Regras e parâmetros": "sliders",
    });
  });

  it("mantém a rota ativa nas páginas internas da seção", () => {
    expect(isAuthenticatedNavigationItemCurrent("/meus-projetos", "/meus-projetos/projeto-1/documentos")).toBe(true);
    expect(isAuthenticatedNavigationItemCurrent("/documentos", "/documentos/lixeira")).toBe(true);
    expect(isAuthenticatedNavigationItemCurrent("/projetos", "/projetos/novo")).toBe(true);
    expect(isAuthenticatedNavigationItemCurrent("/projetos", "/meus-projetos")).toBe(false);
  });
});
