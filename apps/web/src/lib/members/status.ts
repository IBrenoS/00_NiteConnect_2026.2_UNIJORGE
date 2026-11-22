export const memberStatuses = ["PENDENTE_INGRESSO", "ATIVO", "AFASTADO", "DESLIGADO"] as const;
export type MemberStatus = typeof memberStatuses[number];
export const statusLabel: Record<MemberStatus, string> = {
  PENDENTE_INGRESSO: "Pendente de ingresso", ATIVO: "Ativo", AFASTADO: "Afastado", DESLIGADO: "Desligado",
};
export const roleLabel: Record<string, string> = {
  INTEGRANTE: "Integrante", GESTOR_PROJETO: "Gestor de projeto",
  GESTOR_GERAL: "Gestor geral", COORDENADOR: "Coordenador",
};
