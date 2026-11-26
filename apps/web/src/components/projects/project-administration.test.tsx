import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../lib/projects/administration-actions", () => ({ createProjectAction: vi.fn(), updateProjectAction: vi.fn(), changeProjectStatusAction: vi.fn(), manageProjectMemberAction: vi.fn(), transferProjectLeadershipAction: vi.fn() }));
vi.mock("../../lib/projects/actions", () => ({ setProjectAvailabilityAction: vi.fn() }));
import { ProjectDetailsForm, ProjectAdministration } from "./project-administration";
const workspace = { projectId: "p1", name: "Projeto persistido", description: "Descrição", status: "PLANEJAMENTO" as const, startsOn: null, endsOn: null, leaderId: null, leaderName: null, leadershipVacant: true, memberCount: 0, activityCount: 0, version: 0, acceptingMembers: false, capabilities: { canAccessWorkspace: true, canManageMembers: true, canManageAvailability: true, canViewActivities: true, canViewDocuments: true, canCreatePlanning: true, canDecideRequests: true, canTransferLeadership: true, canEditProject: true, canDeleteProject: true } };
const props = { workspace, members: [], candidates: [], canChangeStatus: true, issues: [] };
it("criação só pede os campos do contrato e explica estado inicial e ausência de vínculo", () => {
 const html = renderToStaticMarkup(<ProjectDetailsForm/>);
 for (const name of ["title", "description", "startsOn", "endsOn", "initialStatus"]) expect(html).toContain(`name="${name}"`);
 expect(html).toContain('aria-label="Imagem de capa"'); expect(html).not.toContain('name="reason"'); expect(html).not.toContain('name="memberId"');
 expect(html).toContain("Planejamento"); expect(html).toContain("Em andamento"); expect(html).toContain("Pausado");
 expect(html).toContain("não adiciona você nem outra pessoa à equipe e não designa gestor"); expect(html).not.toContain("Motivo administrativo");
});
it("edição preenche os dados atuais e não exige motivo manual",()=>{
 const html=renderToStaticMarkup(<ProjectDetailsForm project={{id:"p1",title:"Projeto atual",description:"Descrição atual",startsOn:"2026-11-01",endsOn:null,status:"ATIVO",version:4}}/>);
 expect(html).toContain('value="Projeto atual"');expect(html).toContain("Descrição atual");expect(html).toContain('value="2026-11-01"');
 expect(html).toContain("Editar projeto");expect(html).not.toContain('name="reason"');expect(html).not.toContain("Motivo administrativo");
});
it("administração exibe dados reais, transição permitida e equipe vazia sem atribuir criador", () => {
 const html = renderToStaticMarkup(<ProjectAdministration {...props}/>);
 expect(html).toContain("Projeto persistido"); expect(html).toContain("Ativar");
 expect(html).not.toContain('value="CONCLUIDO"'); expect(html).toContain("Nenhuma participação vigente");
 expect(html).not.toContain("Históricos"); expect(html).not.toContain("Histórico de situações"); expect(html).not.toContain("Versão 0"); expect(html).toContain("Designar gestor do projeto");
 expect(html).not.toContain('name="reason"'); expect(html).not.toContain("Motivo administrativo");
 expect(html).toContain('href="/meus-projetos/p1/documentos/aprovacoes"');
});
it("liderança contextual não recebe ações globais de situação ou transferência", () => {
 const html = renderToStaticMarkup(<ProjectAdministration {...props} canChangeStatus={false} workspace={{ ...workspace, capabilities: { ...workspace.capabilities, canEditProject: false, canDeleteProject: false, canTransferLeadership: false } }}/>);
 expect(html).not.toContain("Alterar situação"); expect(html).not.toContain("Configurar liderança"); expect(html).not.toContain("Salvar dados");
 expect(html).not.toContain("Solicitações de exclusão"); expect(html).not.toContain("Históricos");
});
