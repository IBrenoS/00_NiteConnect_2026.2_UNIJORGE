"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterSelect } from "../ui/filter-select";
import type { LeadershipProject } from "../../lib/projects/contracts";
import { resolveWorkspaceContext, workspaceContextHref } from "../shell/workspace-context";

export function ViewSelector({ id, projects, canAdminister }: {
  id: string;
  projects: LeadershipProject[];
  canAdminister: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedContext = searchParams.get("scope");
  const contextValue = resolveWorkspaceContext(requestedContext, projects, canAdminister);
  const value = requestedContext === null || requestedContext === contextValue ? contextValue : "";
  const options: { value: string; label: string }[] = [
    { value: "personal", label: "Meu espaço" },
    ...projects.map((project) => ({ value: `project:${project.projectId}`, label: project.title })),
    ...(canAdminister ? [{ value: "institutional", label: "Visão geral do NITE" }] : []),
  ];

  const changeContext = (nextValue: string) => {
    if (!nextValue) return;
    const allowedContext = resolveWorkspaceContext(nextValue, projects, canAdminister);
    if (allowedContext !== nextValue) return;
    router.push(workspaceContextHref(pathname, searchParams.toString(), allowedContext));
  };

  return <label className="flex min-w-0 max-w-full items-center gap-2 text-type-metadata text-nite-text-secondary">Visão
    <FilterSelect id={id} aria-label="Visão" value={value} onChange={event => changeContext(event.target.value)}>
      {!value ? <option value="" disabled>Contexto indisponível</option> : null}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </FilterSelect>
  </label>;
}
