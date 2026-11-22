"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedNiteSession } from "../auth/server-session";
import { resolveApiUrl } from "../api/server";
import { memberStatuses, type MemberStatus } from "./status";

export async function changeMemberStatus(input: { id: string; status: MemberStatus; version: number; reason: string }): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(input.id) || !memberStatuses.includes(input.status)
    || !Number.isSafeInteger(input.version) || input.version < 0 || !input.reason.trim() || input.reason.length > 1000)
    return "Confira a situação e informe um motivo.";
  const session = await requireAuthenticatedNiteSession();
  if (!session.roles.some(role => role === "GESTOR_GERAL" || role === "COORDENADOR")) return "Acesso não autorizado.";
  const url = resolveApiUrl(`/api/v1/members/${input.id}/status`);
  if (!url) return "Serviço de integrantes indisponível.";
  try {
    const response = await fetch(url, { method: "PATCH", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${session.bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: input.status, expectedVersion: input.version, reason: input.reason.trim() }) });
    if (response.status === 409) return "O cadastro mudou ou a transição foi recusada. Recarregue a ficha.";
    if (response.status === 403) return "Você não tem permissão para alterar esta situação.";
    if (!response.ok) return "Não foi possível alterar a situação. Confira os dados e tente novamente.";
    revalidatePath(`/gestao/integrantes/${input.id}`);
    revalidatePath("/gestao/integrantes");
    return null;
  } catch { return "Serviço de integrantes indisponível. Tente novamente."; }
}
