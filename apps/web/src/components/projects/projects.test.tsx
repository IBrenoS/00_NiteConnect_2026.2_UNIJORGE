import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectDirectory } from "./project-directory";
import { ProjectPresentation } from "./project-presentation";
import { ProjectOverview, ProjectWorkspaceShell } from "./project-workspace";
import { ProjectTeam } from "./project-team";
import { LibraryExplorer } from "../documents/library-explorer";
import { getVisualDocuments } from "../../lib/projects/visual-documents";
import { PlanningForm } from "../activity-planning-preview/activity-planning-preview";

vi.mock("next/navigation", () => ({ usePathname: () => "/meus-projetos/p1", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../lib/projects/actions", () => ({ requestProjectMembershipAction: vi.fn(), expressProjectInterestAction: vi.fn(), decideProjectMembershipAction: vi.fn(), setProjectAvailabilityAction: vi.fn() }));
vi.mock("../../lib/documents/library-actions", () => ({ archiveLibraryFile: vi.fn(), archiveLibraryFolder: vi.fn(), createLibraryFolder: vi.fn(), organizeLibraryFile: vi.fn(), updateLibraryFolder: vi.fn(), setProjectDocumentEditGrant: vi.fn() }));
vi.mock("../documents/library-upload-form", () => ({ LibraryUploadForm: () => null }));

const caps = { canViewPresentation: true, canRequestMembership: false, canExpressInterest: false, canDecideRequests: false, canAccessWorkspace: true, canViewActivities: true, canViewDocuments: true, canManageMembers: false, canManageAvailability: false };
const project = { id: "p1", name: "Projeto persistido", summary: "Resumo autorizado", status: "ATIVO" as const, image: null, leaderName: "Liderança real", leadershipVacant: false, memberCount: 2, acceptingMembers: true, startsOn: null, endsOn: null, capabilities: caps };
const workspace = { projectId: "p1", name: project.name, description: "Descrição privada autorizada", status: project.status, startsOn: null, endsOn: null, leaderId: "leader", leaderName: project.leaderName, leadershipVacant: false, memberCount: 2, activityCount: 7, version: 3, acceptingMembers: true, capabilities: { canAccessWorkspace: true, canManageMembers: false, canViewActivities: true, canViewDocuments: true, canManageAvailability: false, canDecideRequests: false, canCreatePlanning: false, canTransferLeadership: false } };
const members = [{ id: "membership", memberId: "leader", memberName: "Liderança real", responsibility: "Responsabilidade persistida", startedAt: "2026-11-18T12:00:00Z" }];

describe("interfaces integradas de projetos", () => {
  it("renderiza somente dados recebidos e separa vínculo de acompanhamento administrativo", () => {
    const html = renderToStaticMarkup(<ProjectDirectory projects={[project]} ownProjectIds={["p1"]} personal canAdminister={false}/>);
    expect(html).toContain("Projeto persistido");
    expect(html).toContain("Resumo autorizado");
    expect(html).not.toContain("Dados de exemplo");
    expect(html).not.toContain("Acompanhamento administrativo");
    expect(html).not.toContain("NITE Connect");
    expect(renderToStaticMarkup(<ProjectDirectory projects={[project]} ownProjectIds={[]} personal canAdminister/>)).toContain("Acompanhamento administrativo");
  });
  it("identifica a liderança vigente no vínculo pessoal sem usar o papel global como substituto", () => {
    const html = renderToStaticMarkup(<ProjectDirectory projects={[project]} ownProjectIds={["p1"]} leadershipProjectIds={["p1"]} personal canAdminister/>);
    expect(html).toContain("Gestor do projeto");
  });
  it("usa capacidades públicas para ações e nunca inclui conteúdo privado na apresentação", () => {
    const html = renderToStaticMarkup(<ProjectPresentation project={{ ...project, capabilities: { ...caps, canAccessWorkspace: false, canRequestMembership: true } }} requests={[]} interests={[]}/>);
    expect(html).toContain("Solicitar participação");
    expect(html).not.toContain("Abrir workspace");
    expect(html).not.toContain(workspace.description);
    expect(html).not.toContain("Dados de exemplo");
  });
  it("não inventa objetivos ou próximos passos e apresenta a contagem real de atividades", () => {
    const html = renderToStaticMarkup(<ProjectOverview workspace={workspace} members={members}/>);
    expect(html).toContain(workspace.description);
    expect(html).toContain("Responsabilidade persistida");
    expect(html).toContain("7");
    expect(html).not.toContain("Recursos do projeto");
    expect(html).not.toContain("Compreender as necessidades");
    expect(html).not.toContain("Próximos passos");
    expect(html).not.toContain("Dados de exemplo");
  });
  it("oculta navegação de atividades quando a capacidade contextual estiver ausente", () => {
    const html = renderToStaticMarkup(<ProjectOverview workspace={{ ...workspace, capabilities: { ...workspace.capabilities, canViewActivities: false } }} members={members}/>);
    expect(html).not.toContain('href="/meus-projetos/p1/atividades"');
  });
  it("não oferece solicitações ou gestão a participante comum", () => {
    const html = renderToStaticMarkup(<ProjectTeam workspace={workspace} members={members} requests={[]}/>);
    expect(html).toContain("Responsabilidade persistida");
    expect(html).not.toContain("Solicitações");
    expect(html).not.toContain("Aprovar");
    expect(html).not.toContain("Dados de exemplo");
  });
  it("mantém o shell e as áreas autorizadas sem aviso demonstrativo global", () => {
    const html = renderToStaticMarkup(<ProjectWorkspaceShell workspace={workspace} participates><p>Conteúdo real</p></ProjectWorkspaceShell>);
    expect(html).toContain("Conteúdo real");
    expect(html).toContain("Atividades e planejamento");
    expect(html).toContain("Documentos");
    expect(html).not.toContain("Dados de exemplo");
  });
  it("mantém projeto fixado no formulário canônico", () => {
    const html = renderToStaticMarkup(<PlanningForm fixedProject={{ id: "p1", title: project.name }} onClose={() => undefined} onCreate={() => undefined}/>);
    expect(html).toContain(project.name);
    expect(html).not.toContain("Independente");
  });
  it("preserva os limites da biblioteca temporária até o Bloco 08.4B-3", () => {
    const html = renderToStaticMarkup(<LibraryExplorer listing={getVisualDocuments("p1")} base="/meus-projetos/p1/documentos" canManage personal temporary/>);
    expect(html).toContain("Exemplo · sem download");
    expect(html).not.toContain("/api/library/");
    expect(html).not.toContain("Criar ou carregar arquivo");
  });
});

it("Novo projeto depende de autoridade efetiva e não aparece em Meus Projetos", () => {
 const base = { projects: [project], ownProjectIds: [] };
 expect(renderToStaticMarkup(<ProjectDirectory {...base} canAdminister/>)).not.toContain('href="/projetos/novo"');
 expect(renderToStaticMarkup(<ProjectDirectory {...base} canCreate/>)).toContain('href="/projetos/novo"');
 expect(renderToStaticMarkup(<ProjectDirectory {...base} canCreate personal/>)).not.toContain('href="/projetos/novo"');
});
it("administração no detalhe respeita capacidades recebidas do backend", () => {
 expect(renderToStaticMarkup(<ProjectPresentation project={project} requests={[]} interests={[]}/>)).not.toContain("Administrar projeto");
 expect(renderToStaticMarkup(<ProjectPresentation project={{ ...project, capabilities: { ...caps, canManageMembers: true } }} requests={[]} interests={[]}/>)).toContain('href="/projetos/p1/administrar"');
});
