"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ProjectAdministrationLegacyRedirect({ projectId }: { projectId: string }) {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash;
    const destination = hash === "#dados"
      ? `/projetos/${encodeURIComponent(projectId)}?dialog=edit`
      : hash === "#participation"
        ? `/projetos/${encodeURIComponent(projectId)}/equipe`
        : `/projetos/${encodeURIComponent(projectId)}/configuracoes`;
    router.replace(destination);
  }, [projectId, router]);
  return <p role="status" className="p-8 text-sm text-secondary">Abrindo o contexto do projeto…</p>;
}
