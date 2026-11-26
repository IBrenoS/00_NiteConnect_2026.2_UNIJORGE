export type LeadershipProject = {
  projectId: string;
  title: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLeadershipProjects(value: unknown): LeadershipProject[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const projects: LeadershipProject[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.projectId !== "string" ||
      typeof item.title !== "string"
    ) {
      return null;
    }
    projects.push({ projectId: item.projectId, title: item.title });
  }
  return projects;
}
