import type { ProjectStatus, WorkspaceOverview } from "./integration-contracts";
export type ProjectDisplay = { id: string; title: string; publicSummary: string; status: ProjectStatus; imageUrl: string | null; leaderId?: string | null; leaderName: string | null; leadershipVacant: boolean; teamSize: number; acceptingMembers: boolean; startsOn: string | null; endsOn: string | null; canRequestMembership?: boolean; canExpressInterest?: boolean };
export const projectStatusLabels: Record<ProjectStatus, string> = { PLANEJAMENTO: "Em planejamento", ATIVO: "Em andamento", PAUSADO: "Pausado", CONCLUIDO: "Concluído" };
export const requestStateLabels: Record<string, string> = { PENDENTE: "Aguardando análise", APROVADA: "Aprovada", REJEITADA: "Não aprovada", ENCERRADA: "Encerrada", DESISTIDA: "Desistida" };
export function workspaceProject(workspace: WorkspaceOverview): ProjectDisplay {
  return { id: workspace.projectId, title: workspace.name, publicSummary: workspace.description, status: workspace.status, imageUrl: null, leaderId: workspace.leaderId, leaderName: workspace.leaderName, leadershipVacant: workspace.leadershipVacant, teamSize: workspace.memberCount, acceptingMembers: workspace.acceptingMembers, startsOn: workspace.startsOn, endsOn: workspace.endsOn, canRequestMembership: workspace.acceptingMembers && workspace.status !== "CONCLUIDO" };
}
export function projectIssueText(issue: string): string {
  if (issue === "conflict") return "Os dados foram alterados. A versão atual foi solicitada; confira os dados antes de tentar novamente.";
  if (issue === "access" || issue === "forbidden") return "Você não tem permissão para acessar esta área ou realizar esta operação.";
  if (issue === "not-found") return "O projeto ou registro está indisponível para este acesso.";
  if (issue === "unauthenticated") return "Sua sessão precisa ser renovada. Entre novamente para continuar.";
  if (issue === "invalid") return "Não foi possível validar os dados. Confira os campos e tente novamente.";
  return "Não foi possível carregar ou salvar os dados. Tente novamente.";
}
