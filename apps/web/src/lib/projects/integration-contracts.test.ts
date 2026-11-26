import { describe, expect, it } from "vitest";
import { parseCatalogProject, parseMembershipRequest, parseWorkspaceOverview } from "./integration-contracts";

export const catalog = {
  id: "11111111-1111-4111-8111-111111111111", name: "Projeto", summary: "Resumo", status: "ATIVO",
  image: null, leaderName: "Ana", leadershipVacant: false, memberCount: 2, acceptingMembers: true, startsOn: null, endsOn: null, membershipRequestState: null,
  capabilities: { canViewPresentation: true, canRequestMembership: true, canDecideRequests: false, canAccessWorkspace: false, canViewActivities: false, canViewDocuments: false, canManageMembers: false, canManageAvailability: false, canEditProject: false, canDeleteProject: false },
};
describe("contratos reais de projetos", () => {
  it("aceita o resumo público sem fabricar campos privados", () => {
    expect(parseCatalogProject(catalog)).toEqual(catalog);
    expect(parseCatalogProject({ ...catalog, description: "privado" })).not.toHaveProperty("description");
  });
  it.each([{ status: "inventado" }, { memberCount: -1 }, { startsOn: "2026-02-30" }, { capabilities: {} }])("rejeita catálogo malformado %j", (patch) => {
    expect(parseCatalogProject({ ...catalog, ...patch })).toBeNull();
  });
  it("rejeita workspace sem versão ou capacidade válida", () => {
    expect(parseWorkspaceOverview({ projectId: catalog.id, name: "x" })).toBeNull();
    const workspace = { projectId: catalog.id, name: "Projeto", description: "Descrição", status: "ATIVO", startsOn: null, endsOn: null, leaderId: catalog.id, leaderName: "Ana", leadershipVacant: false, memberCount: 2, activityCount: 4, version: 3, acceptingMembers: true, capabilities: { canAccessWorkspace: true, canManageMembers: true, canViewActivities: true, canViewDocuments: true, canManageAvailability: true, canEditProject: true, canDeleteProject: true, canDecideRequests: true, canCreatePlanning: true, canTransferLeadership: false } };
    expect(parseWorkspaceOverview(workspace)).toEqual(workspace);
    expect(parseWorkspaceOverview({ ...workspace, capabilities: { ...workspace.capabilities, canDecideRequests: "yes" } })).toBeNull();
  });
  it("aceita pedidos sem nome e rejeita versão inválida", () => {
    const request = { id: catalog.id, projectId: catalog.id, memberId: catalog.id, message: null, state: "PENDENTE", requestedAt: "2026-11-18T12:00:00Z", decidedAt: null, decidedBy: null, decisionMessage: null, version: 0 };
    expect(parseMembershipRequest(request)).toEqual(request);
    expect(parseMembershipRequest({ ...request, version: -1 })).toBeNull();
    expect(parseMembershipRequest({ ...request, state: "UNKNOWN" })).toBeNull();
  });
});
