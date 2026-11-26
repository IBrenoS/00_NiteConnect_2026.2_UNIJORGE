import type { ProjectDisplay } from "./presentation";
import type { ProjectStatus } from "./integration-contracts";

/** ProjectParticipationService.CatalogProject; public response projection. */
export type CatalogProjectContract = {
  id: string; name: string; summary: string; status: ProjectStatus; image: string | null;
  leaderName: string | null; leadershipVacant: boolean; memberCount: number;
  acceptingMembers: boolean; startsOn: string | null; endsOn: string | null; membershipRequestState: "PENDENTE" | "APROVADA" | "REJEITADA" | "ENCERRADA" | null;
  capabilities: { canViewPresentation: boolean; canRequestMembership: boolean;
    canDecideRequests: boolean; canAccessWorkspace: boolean; canViewActivities: boolean;
    canViewDocuments: boolean; canManageMembers: boolean; canManageAvailability: boolean; canEditProject: boolean; canDeleteProject: boolean };
};
/** Explicit public projection. Cover bytes are served through the authenticated same-origin proxy. */
export function projectFromCatalog(value: CatalogProjectContract): ProjectDisplay {
  return { id: value.id, title: value.name, publicSummary: value.summary, status: value.status,
    imageUrl: value.image ? `/api/project-covers/${encodeURIComponent(value.id)}` : null, leaderName: value.leaderName, leadershipVacant: value.leadershipVacant,
    teamSize: value.memberCount, acceptingMembers: value.acceptingMembers,
    startsOn: value.startsOn, endsOn: value.endsOn,
    canRequestMembership: value.capabilities.canRequestMembership,
  };
}
