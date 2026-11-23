import type { ActivityPriority, ActivityStatus } from "../../lib/activities/contracts";

export const activityStatusGroupTone: Record<ActivityStatus, string> = {
  PLANEJADA: "border border-status-draft-border bg-status-draft-soft text-status-draft",
  EM_EXECUCAO: "border border-status-progress-border bg-status-progress-soft text-status-progress",
  CONCLUIDA: "border border-status-done-border bg-status-done-soft text-status-done",
  CANCELADA: "border border-status-cancelled-border bg-status-cancelled-soft text-status-cancelled",
};

export const activityPriorityGroupTone: Record<ActivityPriority | "SEM_PRIORIDADE", string> = {
  BAIXA: "border border-status-done-border bg-status-done-soft text-status-done",
  MEDIA: "border border-status-warning-border bg-status-warning-soft text-status-warning",
  ALTA: "border border-status-error-border bg-status-error-soft text-status-error",
  SEM_PRIORIDADE: "border border-nite-border-soft bg-nite-surface-subtle text-nite-text-secondary",
};
