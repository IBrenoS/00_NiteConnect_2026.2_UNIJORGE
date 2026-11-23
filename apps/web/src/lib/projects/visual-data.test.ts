import { describe, expect, it } from "vitest";
import { createVisualWorkspace, participationAction, selectProjects, visualCatalog, visualParticipationIds } from "./visual-data";
import { getVisualDocuments } from "./visual-documents";
import { projectFromCatalog, type CatalogProjectContract } from "./catalog-contract";

describe("projetos temporários 08.4A", () => {
  it("separa o catálogo público dos dados operacionais", () => {
    for (const project of visualCatalog) {
      expect(project.imageUrl).toBeNull();
      for (const privateKey of ["people", "tasks", "plannings", "documents", "requests"]) expect(project).not.toHaveProperty(privateKey);
      expect(project.id).toMatch(/^exemplo-/);
    }
  });
  it("pesquisa nome e gestor, combinando situação e disponibilidade", () => {
    expect(selectProjects(visualCatalog, " CAMILA ", "ATIVO", "open").map(p => p.id)).toEqual(["exemplo-acessibilidade"]);
    expect(selectProjects(visualCatalog, "sem resultado", "all", "all")).toEqual([]);
    expect(selectProjects(visualCatalog, "", "CONCLUIDO", "open")).toEqual([]);
  });
  it("mantém interesse futuro separado de ingresso e bloqueia projetos concluídos", () => {
    const project = visualCatalog[0];
    expect(participationAction(project)).toBe("request");
    expect(participationAction({ ...project, status: "PAUSADO" })).toBe("interest");
    expect(participationAction({ ...project, leadershipVacant: true })).toBe("interest");
    expect(participationAction({ ...project, acceptingMembers: false })).toBeNull();
    expect(participationAction({ ...project, status: "CONCLUIDO" })).toBeNull();
  });
  it("não mistura participações com os projetos acompanhados pela administração", () => {
    expect(visualParticipationIds.every(id => visualCatalog.some(p => p.id === id))).toBe(true);
    const monitoring = visualCatalog.filter(p => !visualParticipationIds.includes(p.id));
    expect(monitoring).toHaveLength(4);
    expect(monitoring.some(p => visualParticipationIds.includes(p.id))).toBe(false);
  });
  it("contextualiza planejamentos, tarefas e executores sem compartilhar referências mutáveis", () => {
    for (const project of visualCatalog) {
      const workspace = createVisualWorkspace(project);
      expect(workspace.people).toHaveLength(project.teamSize);
      for (const planning of workspace.plannings) {
        expect(planning.projectId).toBe(project.id);
        for (const task of planning.tasks) expect(workspace.people.some(p => p.id === task.ownerId)).toBe(true);
      }
      const another = createVisualWorkspace(project);
      expect(workspace.plannings[0].tasks).not.toBe(another.plannings[0].tasks);
    }
  });
  it("isola a navegação documental entre projetos e mantém estado vazio de pasta", () => {
    const root = getVisualDocuments("exemplo-a");
    expect(root.files).toHaveLength(2);
    const folder = getVisualDocuments("exemplo-a", root.folders[0].id);
    expect(folder.files).toHaveLength(1);
    expect(folder.folder.projectId).toBe("exemplo-a");
    expect(getVisualDocuments("exemplo-b", root.folders[0].id).folder.kind).toBe("PROJECT");
    expect(getVisualDocuments("exemplo-a", root.folders[1].id).files).toEqual([]);
    expect(getVisualDocuments("exemplo-a", undefined, "objetivos").files).toHaveLength(1);
  });
  it("projeta os nomes reais do contrato V42 sem transportar campos extras", () => {
    const response: CatalogProjectContract = { id: "id", name: "Nome", summary: "Resumo público", status: "ATIVO", image: null, leaderName: null, leadershipVacant: true, memberCount: 2, acceptingMembers: false, startsOn: null, endsOn: null, membershipRequestState: null, capabilities: { canViewPresentation: true, canRequestMembership: false, canExpressInterest: true, canDecideRequests: false, canAccessWorkspace: false, canViewActivities: false, canViewDocuments: false, canManageMembers: false, canManageAvailability: false } };
    expect(projectFromCatalog(response)).toMatchObject({ title: "Nome", publicSummary: "Resumo público", teamSize: 2, imageUrl: null });
    expect(projectFromCatalog(response)).not.toHaveProperty("capabilities");
  });
});
