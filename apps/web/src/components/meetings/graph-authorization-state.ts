import { isMeetingGraphConsentRequired, type MeetingGraphAvailabilityResult } from "../../lib/meetings/contracts";

export type GraphAuthorizationViewState =
  | "checking"
  | "consent-required"
  | "admin-approval-required"
  | "not-configured"
  | "teams-unavailable"
  | "session-required"
  | "unavailable";

export type GraphAuthorizationResolution = Exclude<GraphAuthorizationViewState, "checking"> | "available";

export function resolveGraphAuthorizationViewState(
  result: MeetingGraphAvailabilityResult,
): GraphAuthorizationResolution {
  if (isMeetingGraphConsentRequired(result)) return "consent-required";
  return result.state === "consent-required" ? "unavailable" : result.state;
}

export function graphAuthorizationStatusMessage(
  state: Exclude<GraphAuthorizationResolution, "available" | "consent-required">,
): string {
  switch (state) {
    case "admin-approval-required":
      return "A integração exige aprovação administrativa institucional. Entre em contato com a equipe responsável.";
    case "not-configured":
      return "A integração Microsoft 365 não está configurada para este ambiente.";
    case "teams-unavailable":
      return "A conta institucional consultada não oferece suporte a reuniões do Teams.";
    case "session-required":
      return "A API não aceitou sua sessão institucional. Atualize a sessão e tente novamente.";
    case "unavailable":
      return "A conexão está temporariamente indisponível. Tente novamente.";
  }
}
