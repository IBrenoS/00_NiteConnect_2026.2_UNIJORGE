import "server-only";
import { getApiJson } from "../api/server";
import { parsePage } from "../activities/contracts";
import { getMembers, getMember, getMemberHistory } from "../members/administrative";

export { getMembers, getMember, getMemberHistory };

export const initialRoles = ["INTEGRANTE", "GESTOR_PROJETO", "GESTOR_GERAL", "COORDENADOR"] as const;
export type InitialRole = typeof initialRoles[number];
export const invitationStates = ["ALL", "PENDING", "ACCEPTED", "EXPIRED", "REVOKED", "SEND_FAILED"] as const;
export type InvitationState = typeof invitationStates[number];
export type Invitation = {
  id: string; memberId: string; name: string; email: string; createdAt: string; expiresAt: string;
  acceptedAt: string | null; revokedAt: string | null; initialRole: InitialRole;
  sendState: string; sendAttempts: number; sendErrorCode: string | null; lastSendAt: string | null;
};
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const optionalDate = (value: unknown): value is string | null => value === null || typeof value === "string";
export function parseInvitation(value: unknown): Invitation | null {
  if (!object(value) || typeof value.id !== "string" || typeof value.memberId !== "string" || typeof value.name !== "string"
    || typeof value.email !== "string" || typeof value.createdAt !== "string" || typeof value.expiresAt !== "string"
    || !optionalDate(value.acceptedAt) || !optionalDate(value.revokedAt) || !initialRoles.includes(value.initialRole as InitialRole)
    || typeof value.sendState !== "string" || typeof value.sendAttempts !== "number" || !optionalDate(value.sendErrorCode)
    || !optionalDate(value.lastSendAt)) return null;
  return { id: value.id, memberId: value.memberId, name: value.name, email: value.email,
    createdAt: value.createdAt, expiresAt: value.expiresAt, acceptedAt: value.acceptedAt,
    revokedAt: value.revokedAt, initialRole: value.initialRole as InitialRole, sendState: value.sendState,
    sendAttempts: value.sendAttempts, sendErrorCode: value.sendErrorCode, lastSendAt: value.lastSendAt };
}
export const getInvitations = (bearer: string, state: InvitationState, page: number, q: string) =>
  getApiJson(`/api/v1/invitations?${new URLSearchParams({ state, page: String(page), size: "20", q })}`,
    bearer, value => parsePage(value, parseInvitation));
export function invitationStatus(invitation: Invitation): string {
  if (invitation.revokedAt) return "Revogado";
  if (invitation.acceptedAt) return "Aceito";
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "Expirado";
  if (invitation.sendState === "FAILED") return "Falha no envio";
  return "Pendente";
}
