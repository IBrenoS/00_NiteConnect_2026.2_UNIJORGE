import type { LeadershipProject } from "../../lib/projects/contracts";

export type WorkspaceContext = "personal" | "institutional" | `project:${string}`;

const preservedQueryKeys: Readonly<Record<string, readonly string[]>> = {
  "/dashboard": ["from", "to", "q"],
};

export function resolveWorkspaceContext(
  requested: string | null,
  projects: readonly LeadershipProject[],
  canAdminister: boolean,
): WorkspaceContext {
  if (requested === "personal") return "personal";
  if (requested === "institutional" && canAdminister) return "institutional";
  if (requested?.startsWith("project:")) {
    const projectId = requested.slice("project:".length);
    if (projectId && projects.some((project) => project.projectId === projectId)) return `project:${projectId}`;
  }
  return "personal";
}

export function workspaceContextHref(pathname: string, currentSearch: string, context: WorkspaceContext): string {
  const safePathname = pathname.startsWith("/") && !pathname.startsWith("//") && !pathname.includes("\\")
    ? pathname
    : "/dashboard";
  const currentParams = new URLSearchParams(currentSearch);
  const params = new URLSearchParams();
  for (const key of preservedQueryKeys[safePathname] ?? []) {
    const value = currentParams.get(key);
    if (value !== null) params.set(key, value);
  }
  params.set("scope", context);
  const query = params.toString();
  return query ? `${safePathname}?${query}` : safePathname;
}
