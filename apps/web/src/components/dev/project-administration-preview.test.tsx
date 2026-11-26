import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectAdministrationPreview } from "./project-administration-preview";
import { ProjectAdministrationPreviewShell } from "./project-administration-preview-shell";
import { ThemeProvider } from "../theme-provider";

function renderContext(context: "presentation" | "edit" | "team" | "settings") {
  return renderToStaticMarkup(<ThemeProvider><ProjectAdministrationPreviewShell><ProjectAdministrationPreview context={context} /></ProjectAdministrationPreviewShell></ThemeProvider>);
}

describe("prévia da administração de projetos", () => {
  it("mantém edição, equipe e configurações em contextos separados", () => {
    const edit = renderContext("edit");
    const team = renderContext("team");
    const settings = renderContext("settings");

    expect(edit).toContain("Nome do projeto");
    expect(edit).not.toContain("Solicitações para participar");
    expect(edit).not.toContain("Arquivar projeto");
    expect(team).toContain("Solicitações");
    expect(team).not.toContain("Receber solicitações de participação");
    expect(settings).toContain("Receber solicitações de participação");
    expect(settings).toContain("Pausar");
    expect(settings).toContain("Solicitações de exclusão");
    expect(settings).not.toContain("Solicitações para participar");
  });

  it("apresenta o projeto no shell global e expõe o menu contextual", () => {
    const presentation = renderContext("presentation");
    expect(presentation).toContain("Projeto Aurora");
    expect(presentation).toContain("aria-label=\"Ações do projeto\"");
    expect(presentation).toContain("NITE Connect");
    expect(presentation).not.toContain("ADMINISTRAÇÃO</span>");
  });

  it("inclui navegação por integrantes e solicitações e não oferece arquivamento", () => {
    const team = renderContext("team");
    const settings = renderContext("settings");
    expect(team).toContain("Integrantes");
    expect(team).toContain("Solicitações");
    expect(team).toContain("Papel institucional");
    expect(settings).not.toContain("Arquivar projeto");
  });

  it("apresenta somente dados demonstrativos no conteúdo do projeto", () => {
    const team = renderContext("team");
    expect(team).toContain("Marina Lima");
    expect(team).toContain("Solicitações");
    expect(team).toContain("Projeto Aurora");
    expect(team).not.toContain("/api/");
  });
});
