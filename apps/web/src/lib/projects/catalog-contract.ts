import type { ProjectDisplay } from "./presentation";
import type { ProjectStatus } from "./integration-contracts";

/** V42 ProjectParticipationService.CatalogProject; public response projection. */
export type CatalogProjectContract = {
  id: string; name: string; summary: string; status: ProjectStatus; image: string | null;
  leaderName: string | null; leadershipVacant: boolean; memberCount: number;
  acceptingMembers: boolean; startsOn: string | null; endsOn: string | null;
  capabilities: { canViewPresentation: boolean; canRequestMembership: boolean; canExpressInterest: boolean;
    canDecideRequests: boolean; canAccessWorkspace: boolean; canViewActivities: boolean;
    canViewDocuments: boolean; canManageMembers: boolean; canManageAvailability: boolean };
};
/** Explicit public projection. V42 currently has no project image. */
export function projectFromCatalog(value: CatalogProjectContract): ProjectDisplay {
  return { id: value.id, title: value.name, publicSummary: value.summary, status: value.status,
    imageUrl: null, leaderName: value.leaderName, leadershipVacant: value.leadershipVacant,
    teamSize: value.memberCount, acceptingMembers: value.acceptingMembers,
    startsOn: value.startsOn, endsOn: value.endsOn,
    canRequestMembership: value.capabilities.canRequestMembership,
    canExpressInterest: value.capabilities.canExpressInterest };
}
