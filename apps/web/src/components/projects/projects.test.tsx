import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectDirectory } from "./project-directory";
import { ProjectMark, ProjectProperties } from "./project-ui";
import { ProjectPresentation } from "./project-presentation";
import { ProjectOverview, ProjectWorkspaceShell } from "./project-workspace";
import { ProjectTeam } from "./project-team";
import { ProjectContextMenu } from "./project-context-menu";
import { ProjectSettingsAdministration, ProjectTeamAdministration } from "./project-administration-contexts";
import { LibraryExplorer } from "../documents/library-explorer";
import { getVisualDocuments } from "../../lib/projects/visual-documents";
import { PlanningForm, StatsPanel, TaskBoard, type PreviewTask } from "../activity-planning-preview/activity-planning-preview";

vi.mock("next/navigation", () => ({ usePathname: () => "/meus-projetos/p1", useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../lib/projects/actions", () => ({ requestProjectMembershipAction: vi.fn(), decideProjectMembershipAction: vi.fn(), setProjectAvailabilityAction: vi.fn() }));
vi.mock("../../lib/projects/administration-actions", () => ({ deleteProjectAction: vi.fn() }));
vi.mock("../../lib/documents/library-actions", () => ({ archiveLibraryFile: vi.fn(), archiveLibraryFolder: vi.fn(), createLibraryFolder: vi.fn(), organizeLibraryFile: vi.fn(), updateLibraryFolder: vi.fn(), setProjectDocumentEditGrant: vi.fn() }));
vi.mock("../documents/library-upload-form", () => ({ LibraryUploadForm: () => null }));

const caps = { canViewPresentation: true, canRequestMembership: false, canDecideRequests: false, canAccessWorkspace: true, canViewActivities: true, canViewDocuments: true, canManageMembers: false, canManageAvailability: false, canEditProject: false, canDeleteProject: false };
const project = { id: "p1", name: "Projeto persistido", summary: "Resumo autorizado", status: "ATIVO" as const, image: null, leaderName: "Liderança real", leadershipVacant: false, memberCount: 2, acceptingMembers: true, startsOn: null, endsOn: null, membershipRequestState: null, capabilities: caps };
const workspace = { projectId: "p1", name: project.name, description: "Descrição privada autorizada", status: project.status, startsOn: null, endsOn: null, leaderId: "leader", leaderName: project.leaderName, leadershipVacant: false, memberCount: 2, activityCount: 7, version: 3, acceptingMembers: true, capabilities: { canAccessWorkspace: true, canManageMembers: false, canViewActivities: true, canViewDocuments: true, canManageAvailability: false, canEditProject: false, canDeleteProject: false, canDecideRequests: false, canCreatePlanning: false, canTransferLeadership: false } };
const members = [{ id: "membership", memberId: "leader", memberName: "Liderança real", responsibility: "Responsabilidade persistida", startedAt: "2026-11-18T12:00:00Z" }];

describe("interfaces integradas de projetos", () => {
  it("exibe iniciais maiúsculas no fallback de capa", () => {
    expect(renderToStaticMarkup(<ProjectMark title="Novo projeto"/>)).toContain(">NP</span>");
  });
  it("distingue participação vigente da disponibilidade de ingresso", () => {
    const html = renderToStaticMarkup(<ProjectProperties project={projectFromTest()} participates/>);
    expect(html).toContain("Você já participa deste projeto");
    expect(html).not.toContain("Indisponível para sua conta");
  });
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
    const html = renderToStaticMarkup(<ProjectPresentation project={{ ...project, capabilities: { ...caps, canAccessWorkspace: false, canRequestMembership: true } }} requests={[]}/>);
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
  it("não exibe progresso calculado quando não há tarefas elegíveis", () => {
    const html = renderToStaticMarkup(<ProjectOverview workspace={workspace} members={members} statistics={{ total: 1, planned: 0, inProgress: 0, completed: 0, cancelled: 1, overdue: 0, completionDenominator: 0, plannedRate: 0, inProgressRate: 0, completedRate: 0, cancelledRate: 100, completionRate: 0 }}/>);
    expect(html).toContain("Sem tarefas elegíveis para calcular o progresso");
    expect(html).not.toContain("0% das tarefas não canceladas concluídas");
    const planning = renderToStaticMarkup(<StatsPanel tasks={[]} stats={{ total: 1, planned: 0, inProgress: 0, completed: 0, cancelled: 1, overdue: 0, completionDenominator: 0, plannedRate: 0, inProgressRate: 0, completedRate: 0, cancelledRate: 100, completionRate: 0 }}/>);
    expect(planning).toContain("Sem tarefas elegíveis para calcular o progresso");
    expect(planning).not.toContain("0 % das tarefas não canceladas concluídas");
  });
  it("não anuncia solicitações quando a configuração está ativa mas o projeto não pode recebê-las", () => {
    const paused = { ...workspace, status: "PAUSADO" as const, acceptingMembers: true, capabilities: { ...workspace.capabilities, canManageAvailability: true } };
    const html = renderToStaticMarkup(<ProjectOverview workspace={paused} members={members}/>);
    expect(html).toContain("Projeto pausado, mas recebendo pedidos para formar ou recompor a equipe.");
    expect(html).toContain("Desativar solicitações");
  });
  it("não oferece manifestações futuras quando solicitações formais estão fechadas", () => {
    const html = renderToStaticMarkup(<ProjectPresentation project={project} requests={[]}/>);
    expect(html).toContain("Solicitações de participação indisponíveis");
    expect(html).not.toContain("manifestação");
    expect(html).not.toContain("Registrar interesse futuro");
  });
  it("não oferece limpar filtros quando a lista de projetos está realmente vazia", () => {
    const html = renderToStaticMarkup(<ProjectDirectory projects={[]} ownProjectIds={[]}/>);
    expect(html).toContain("Nenhum projeto está disponível no catálogo.");
    expect(html).not.toContain("Limpar filtros");
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
  it("diferencia equipe vazia de pesquisa sem resultados e singulariza a contagem", () => {
    const empty = renderToStaticMarkup(<ProjectTeam workspace={workspace} members={[]} requests={[]}/>);
    expect(empty).toContain("Nenhuma participação vigente");
    expect(empty).not.toContain("Limpar filtros");
    expect(renderToStaticMarkup(<ProjectTeam workspace={workspace} members={members} requests={[]}/>)).toContain("1 integrante");
  });
  it("mantém o shell e as áreas autorizadas sem aviso demonstrativo global", () => {
    const html = renderToStaticMarkup(<ProjectWorkspaceShell workspace={workspace} participates><p>Conteúdo real</p></ProjectWorkspaceShell>);
    expect(html).toContain("Conteúdo real");
    expect(html).toContain("Atividades e planejamento");
    expect(html).toContain("Documentos");
    expect(html).not.toContain("Dados de exemplo");
    expect(html).not.toContain("Opções do projeto");
    expect(html).not.toContain("Apresentação pública");
    expect(html).not.toContain("acesso ao workspace sem participação na equipe");
  });
  it("distingue a administração institucional sem oferecer navegação duplicada", () => {
    const administrative = { ...workspace, capabilities: { ...workspace.capabilities, canManageMembers: true } };
    const html = renderToStaticMarkup(<ProjectWorkspaceShell workspace={administrative} participates={false}><p>Conteúdo real</p></ProjectWorkspaceShell>);
    expect(html).toContain("Gerenciar equipe");
    expect(html).toContain('href="/projetos/p1/equipe"');
    expect(html).not.toContain("Consultar apresentação pública");
    expect(html).not.toContain("Voltar para Meus projetos");
  });
  it("mantém projeto fixado no formulário canônico", () => {
    const html = renderToStaticMarkup(<PlanningForm fixedProject={{ id: "p1", title: project.name }} onClose={() => undefined} onCreate={() => undefined}/>);
    expect(html).toContain(project.name);
    expect(html).not.toContain("Independente");
  });
  it("usa o singular no indicador de tarefas do Kanban", () => {
    const task: PreviewTask = { id: "task-1", title: "Tarefa persistida", status: "Em andamento", priority: "Alta", owner: "Integrante", start: "Sem data", due: "Sem prazo", description: "" };
    const html = renderToStaticMarkup(<TaskBoard tasks={[task]} grouping="status" onEdit={() => undefined} onAdd={() => undefined} onMove={() => undefined}/>);
    expect(html).toContain('aria-label="Em andamento, 1 tarefa"');
  });
  it("preserva os limites da biblioteca temporária até o Bloco 08.4B-3", () => {
    const html = renderToStaticMarkup(<LibraryExplorer listing={getVisualDocuments("p1")} base="/meus-projetos/p1/documentos" canManage personal temporary/>);
    expect(html).toContain("Exemplo · sem download");
    expect(html).not.toContain("/api/library/");
    expect(html).not.toContain("Criar ou carregar arquivo");
  });
});

function projectFromTest() {
  return { id: "p1", title: "Projeto persistido", publicSummary: "Resumo autorizado", status: "ATIVO" as const, imageUrl: null, leaderId: null, leaderName: null, leadershipVacant: true, teamSize: 0, acceptingMembers: true, startsOn: null, endsOn: null, canRequestMembership: false };
}

it("abre Meus pedidos quando a rota inclui tab=requests", () => {
 const html = renderToStaticMarkup(<ProjectDirectory projects={[project]} ownProjectIds={[]} initialTab="requests"/>);
 expect(html).toContain('aria-label="Seus pedidos e manifestações"');
 expect(html).toContain("Nenhum pedido por aqui");
 expect(html).not.toContain("Pesquisa e filtros atuais");
});

it("Novo projeto depende de autoridade efetiva e não aparece em Meus Projetos", () => {
 const base = { projects: [project], ownProjectIds: [] };
 expect(renderToStaticMarkup(<ProjectDirectory {...base} canAdminister/>)).not.toContain('href="/projetos/novo"');
 expect(renderToStaticMarkup(<ProjectDirectory {...base} canCreate/>)).toContain('href="/projetos/novo"');
 expect(renderToStaticMarkup(<ProjectDirectory {...base} canCreate personal/>)).not.toContain('href="/projetos/novo"');
});
it("administração no detalhe respeita capacidades recebidas do backend", () => {
    expect(renderToStaticMarkup(<ProjectPresentation project={project} requests={[]}/>)).not.toContain("Administrar projeto");
    expect(renderToStaticMarkup(<ProjectPresentation project={{ ...project, capabilities: { ...caps, canManageMembers: true } }} requests={[]}/>)).toContain('href="/projetos/p1/equipe"');
});
it("menu contextual não aparece vazio e separa a exclusão das ações comuns",()=>{
 const empty=renderToStaticMarkup(<ProjectContextMenu projectId="p1" name="Projeto" canEdit={false} canManageTeam={false} canConfigure={false} canDelete={false}/>);
 expect(empty).toBe("");
 const menu=renderToStaticMarkup(<ProjectContextMenu projectId="p1" name="Projeto" canEdit canManageTeam canConfigure canDelete/>);
 expect(menu).toContain("Editar projeto");expect(menu).toContain("Gerenciar equipe");expect(menu).toContain("Configurações do projeto");
 expect(menu).toContain("Excluir projeto?");expect(menu).toContain("Projeto");expect(menu).toContain("deixará de aparecer nas áreas ativas");
 expect(menu).not.toContain("justificativa");expect(menu).not.toContain("checkbox");
});
it("liga cada ação do menu ao contexto aprovado",()=>{
 const menu=renderToStaticMarkup(<ProjectContextMenu projectId="p1" name="Projeto" canEdit canManageTeam canConfigure canDelete/>);
 expect(menu).toContain('href="/projetos/p1?dialog=edit"');
 expect(menu).toContain('href="/projetos/p1/equipe"');
 expect(menu).toContain('href="/projetos/p1/configuracoes"');
});
it("equipe mostra apenas dados contratuais e liderança contextual",()=>{
 const adminWorkspace={...workspace,capabilities:{...workspace.capabilities,canManageMembers:true,canTransferLeadership:true}};
 const html=renderToStaticMarkup(<ProjectTeamAdministration workspace={adminWorkspace} members={members} requests={[]}/>);
 expect(html).toContain("Responsabilidade persistida");
 expect(html).toContain("Liderança do projeto");
 expect(html).toContain("Gestor do projeto");
 expect(html).not.toContain("Gestão geral");
 expect(html).not.toContain("email");
});
it("configurações usa transições contratuais, switch e zona de risco",()=>{
 const adminWorkspace={...workspace,capabilities:{...workspace.capabilities,canManageMembers:true,canManageAvailability:true,canDeleteProject:true}};
 const html=renderToStaticMarkup(<ProjectSettingsAdministration workspace={adminWorkspace} canChangeStatus/>);
 expect(html).toContain('role="switch"');
 expect(html).toContain("Transições disponíveis");
 expect(html).toContain("Zona de risco");
 expect(html).not.toContain("Arquivar projeto");
});
