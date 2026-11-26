"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { resolveApiUrl } from "../api/server";
import { initialRoles, getMember, type InitialRole } from "./data";

type Outcome = { ok: boolean; message: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid: Outcome = { ok: false, message: "Confira os dados informados." };

async function mutate(path: string, method: "POST" | "DELETE", body?: object): Promise<Outcome> {
  const session = await requireAuthenticatedNiteSession();
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR"))
    return { ok: false, message: "Acesso não autorizado." };
  const url = resolveApiUrl(path);
  if (!url) return { ok: false, message: "Serviço de acessos indisponível." };
  try {
    const response = await fetch(url, { method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${session.bearer}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.ok) {
      revalidatePath("/gestao/acessos-e-convites");
      revalidatePath("/gestao/integrantes");
      return { ok: true, message: "Operação concluída." };
    }
    if (response.status === 403) return { ok: false, message: "Você não tem permissão para esta operação." };
    if (response.status === 404) return { ok: false, message: "Registro não encontrado ou indisponível para esta conta." };
    if (response.status === 409) {
      const detail: unknown = await response.json().catch(() => null);
      const text = typeof detail === "object" && detail !== null && "detail" in detail && typeof detail.detail === "string" ? detail.detail : "";
      if (text.includes("administrador ativo")) return { ok: false, message: "É necessário preservar ao menos um administrador ativo." };
      if (text.includes("lideranças vigentes")) return { ok: false, message: "Transfira ou encerre as lideranças de projeto vigentes antes de revogar este papel." };
      if (text.includes("janela de repetição")) return { ok: false, message: "O resultado do envio é incerto. Revogue este convite e crie outro." };
      if (text.includes("convite pendente")) return { ok: false, message: "Já existe um convite pendente para este e-mail." };
      return { ok: false, message: "O registro mudou ou a operação não é permitida no estado atual. Atualize a página." };
    }
    return { ok: false, message: response.status >= 500 ? "Falha temporária do serviço. Tente novamente." : "Confira os dados e tente novamente." };
  } catch { return { ok: false, message: "Serviço de acessos indisponível. Tente novamente." }; }
}

export async function createInvitation(input: { name: string; email: string; role: InitialRole }): Promise<Outcome> {
  const name = input.name.trim(), email = input.email.trim().toLowerCase();
  if (!name || name.length > 160 || !/^[^\s@]+@unijorge\.com\.br$/i.test(email) || email.length > 254
    || !initialRoles.includes(input.role)) return invalid;
  const result = await mutate("/api/v1/invitations", "POST", { name, institutionalEmail: email, initialRole: input.role });
  return result.ok ? { ok: true, message: "Convite criado. Confira a situação do envio na lista; aceite pelo provedor não confirma entrega." } : result;
}
export async function resendInvitation(id: string): Promise<Outcome> {
  if (!uuid.test(id)) return invalid;
  const result = await mutate(`/api/v1/invitations/${id}/send`, "POST");
  return result.ok ? { ok: true, message: "Tentativa registrada. Aceite pelo provedor não confirma entrega." } : result;
}
export async function revokeInvitation(id: string, reason: string): Promise<Outcome> {
  if (!uuid.test(id) || reason.length > 1000) return invalid;
  return mutate(`/api/v1/invitations/${id}`, "DELETE", { reason: reason.trim() || null });
}
export async function changeInstitutionalRole(input: { memberId: string; role: Exclude<InitialRole, "INTEGRANTE">;
  version: number; reason: string; operation: "grant" | "revoke" }): Promise<Outcome> {
  if (!uuid.test(input.memberId) || !initialRoles.includes(input.role)
    || !Number.isSafeInteger(input.version) || input.version < 0 || input.reason.length > 1000) return invalid;
  const path = `/api/v1/members/${input.memberId}/roles`;
  return input.operation === "grant"
    ? mutate(path, "POST", { role: input.role, expectedVersion: input.version, ...(input.reason.trim() ? { reason: input.reason.trim() } : {}) })
    : mutate(`${path}/${input.role}`, "DELETE", { expectedVersion: input.version, ...(input.reason.trim() ? { reason: input.reason.trim() } : {}) });
}

export async function getRoleDetails(id: string) {
  if (!uuid.test(id)) return null;
  const session = await requireAuthenticatedNiteSession();
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR")) return null;
  const detail = await getMember(session.bearer, id);
  return detail.data ? { detail: detail.data } : null;
}
