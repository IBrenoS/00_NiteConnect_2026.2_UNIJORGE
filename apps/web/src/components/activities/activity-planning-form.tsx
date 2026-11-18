"use client";

import { TransientFeedback } from "../ui/transient-feedback";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlanningForm } from "../activity-planning-preview/activity-planning-preview";
import { createPlanningAction } from "../../lib/activities/planning-actions";

export function ActivityPlanningForm({ projects }: { projects: readonly { id: string; title: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const labels = Object.fromEntries(projects.map((project) => [project.id, project.title]));

  async function create(draft: { title: string; description: string; project: string | null }) {
    setError(null);
    const result = await createPlanningAction({ title: draft.title, description: draft.description, projectId: draft.project });
    if (result.issue) {
      setError(result.issue === "unauthenticated" ? "Sua sessão expirou. Entre novamente para criar o planejamento." : result.issue === "unavailable" ? "A API está indisponível. Tente novamente em alguns instantes." : result.issue === "forbidden" ? "Você não tem capacidade para criar este planejamento." : result.issue === "conflict" ? "O contexto mudou. Atualize a página e tente novamente." : result.issue === "access" ? "Você não tem permissão para criar este planejamento." : "Não foi possível criar o planejamento. Tente novamente.");
      return;
    }
    router.push(`/atividades/planejamentos/${result.data.id}`);
  }

  return <div className="mx-auto w-full max-w-[680px]">
    <PlanningForm onClose={() => router.push("/atividades")} onCreate={create} projectOptions={projects.map((project) => project.id)} projectLabels={labels}/>
    {error ? <TransientFeedback messageKey={error} onDismiss={() => setError(null)}><p role="alert" className="mt-4 text-type-body-compact text-status-error">{error}</p></TransientFeedback> : null}
  </div>;
}
