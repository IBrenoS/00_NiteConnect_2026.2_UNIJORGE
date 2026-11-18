import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectVisualProvider } from "./project-visual-provider";
import { ProjectDirectory } from "./project-directory";
import { ProjectPresentation } from "./project-presentation";
import { ProjectTeam } from "./project-team";
import { LibraryExplorer } from "../documents/library-explorer";
import { getVisualDocuments } from "../../lib/projects/visual-documents";
import { PlanningForm, TaskEditor } from "../activity-planning-preview/activity-planning-preview";

vi.mock("../../lib/documents/library-actions", () => ({ archiveLibraryFile: vi.fn(), archiveLibraryFolder: vi.fn(), createLibraryFolder: vi.fn(), organizeLibraryFile: vi.fn(), updateLibraryFolder: vi.fn(), setProjectDocumentEditGrant: vi.fn() }));
vi.mock("../documents/library-upload-form", () => ({ LibraryUploadForm: () => null }));

describe("interfaces de projetos", () => {
  it("reutiliza a criação homologada com projeto fixo e aviso explícito no editor", () => {
    const html = renderToStaticMarkup(<PlanningForm onClose={() => undefined} onCreate={() => undefined} fixedProject={{ id: "exemplo", title: "Projeto contextual" }}/>);
    expect(html).toContain("Projeto contextual");
    expect(html).not.toContain("Independente");
    expect(html).not.toContain('aria-label="Projetos disponíveis"');
    const editor = renderToStaticMarkup(<TaskEditor task={null} onClose={() => undefined} onCreate={() => undefined} onUpdate={() => undefined} persistenceNotice="Alteração somente local"/>);
    expect(editor).toContain("Alteração somente local");
  });
  it("navega do catálogo para as apresentações reais sem expor dados de workspace", () => {
    const html = renderToStaticMarkup(<ProjectVisualProvider canAdminister={false}><ProjectDirectory/></ProjectVisualProvider>);
    expect(html).toContain('href="/projetos/exemplo-acessibilidade"');
    expect(html).toContain("Dados de exemplo");
    expect(html).not.toContain("Beatriz Souza");
    expect(html).not.toContain("Validar a proposta com a equipe");
    expect(html).not.toContain("/preview");
  });
  it("oferece acompanhamento administrativo somente na perspectiva permitida", () => {
    const page = (admin: boolean) => renderToStaticMarkup(<ProjectVisualProvider canAdminister={admin}><ProjectDirectory personal/></ProjectVisualProvider>);
    expect(page(false)).not.toContain("Acompanhamento administrativo");
    expect(page(true)).toContain("Acompanhamento administrativo");
    expect(page(true)).toContain('href="/meus-projetos/exemplo-nite-connect"');
    expect(page(true)).not.toContain("Conexão comunidade");
  });
  it("preserva solicitações para administradores e oculta os pedidos de terceiros dos integrantes", () => {
    const page = (admin: boolean) => renderToStaticMarkup(<ProjectVisualProvider canAdminister={admin}><ProjectTeam projectId="exemplo-nite-connect"/></ProjectVisualProvider>);
    expect(page(false)).not.toContain("Solicitações");
    expect(page(true)).toContain("Solicitações");
    expect(page(false)).not.toContain("Beatriz Souza");
  });
  it("não apresenta ingresso automático nem workspace a visitantes comuns do catálogo", () => {
    const html = renderToStaticMarkup(<ProjectVisualProvider canAdminister={false}><ProjectPresentation projectId="exemplo-acessibilidade"/></ProjectVisualProvider>);
    expect(html).toContain("Solicitar participação");
    expect(html).not.toContain("Abrir workspace");
    expect(html).not.toContain("Validar a proposta com a equipe");
  });
  it("reutiliza a biblioteca sem downloads ou operações reais para arquivos fictícios", () => {
    const html = renderToStaticMarkup(<LibraryExplorer listing={getVisualDocuments("exemplo")} base="/meus-projetos/exemplo/documentos" canManage personal temporary/>);
    expect(html).toContain("Apresentação do projeto.pdf");
    expect(html).toContain("Exemplo · sem download");
    expect(html).not.toContain("/api/library/");
    expect(html).not.toContain("Criar ou carregar arquivo");
    expect(html).not.toContain("Nova subpasta");
  });
});
