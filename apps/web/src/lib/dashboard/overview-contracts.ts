export type DashboardContext = "PERSONAL" | "INSTITUTIONAL";
export type DashboardCount = { situation: string; total: number };
export type DashboardDistribution = {
  total: number;
  planned: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
  attentionRequired: number;
  dueSoon: number;
};
export type DashboardEvolution = { day: string; source: "ACTIVITY" | "PROJECT"; event: string; total: number };
export type DashboardTask = {
  activityId: string;
  title: string;
  priority: string | null;
  dueOn: string | null;
  projectId: string | null;
  linkKinds: string[];
  overdue: boolean;
  dueSoon: boolean;
  href: string;
};
export type DashboardProject = { projectId: string; title: string; situation: string; leader: boolean; openActivities: number; href: string };
export type DashboardCommitment = { id: string; source: "MEETING" | "AGENDA"; title: string; startsAt: string; href: string };
export type DashboardRisk = { projectId: string; title: string; health: string; maxOverdueDays: number; reason: string; href: string };
export type DashboardOverview = {
  context: DashboardContext;
  generatedAt: string;
  asOfDate: string;
  timeZone: string;
  from: string;
  to: string;
  current: { activities: DashboardDistribution; projects: DashboardCount[]; projectHealth: DashboardCount[] };
  risks: { total: number; items: DashboardRisk[] };
  evolution: DashboardEvolution[];
  actions: { total: number; items: DashboardTask[] };
  projects: { total: number; items: DashboardProject[] };
  commitments: { total: number; items: DashboardCommitment[] };
  administrative: { pendingProposals: number; pendingInvitations: number; failedInvitations: number; openAttendanceLists: number } | null;
  unavailable: { indicator: string; reason: string }[];
};

type RecordValue = Record<string, unknown>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function countField(value: RecordValue, key: string): number | null {
  return isCount(value[key]) ? value[key] : null;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function parseCountList(value: unknown): DashboardCount[] | null {
  if (!Array.isArray(value)) return null;
  const result: DashboardCount[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.situation !== "string" || !item.situation || !isCount(item.total)) return null;
    result.push({ situation: item.situation, total: item.total });
  }
  return result;
}

function parseDistribution(value: unknown): DashboardDistribution | null {
  if (!isRecord(value)) return null;
  const total = countField(value, "total");
  const planned = countField(value, "planned");
  const inProgress = countField(value, "inProgress");
  const completed = countField(value, "completed");
  const cancelled = countField(value, "cancelled");
  const overdue = countField(value, "overdue");
  const attentionRequired = countField(value, "attentionRequired");
  const dueSoon = countField(value, "dueSoon");
  if (total === null || planned === null || inProgress === null || completed === null || cancelled === null ||
      overdue === null || attentionRequired === null || dueSoon === null) return null;
  return { total, planned, inProgress, completed, cancelled, overdue, attentionRequired, dueSoon };
}

function parseHighlights<T>(value: unknown, parseItem: (item: unknown) => T | null): { total: number; items: T[] } | null {
  if (!isRecord(value) || !isCount(value.total) || !Array.isArray(value.items)) return null;
  const items: T[] = [];
  for (const item of value.items) {
    const parsed = parseItem(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  if (items.length > value.total) return null;
  return { total: value.total, items };
}

function parseTask(value: unknown): DashboardTask | null {
  if (!isRecord(value) || typeof value.activityId !== "string" || !uuidPattern.test(value.activityId) ||
      typeof value.title !== "string" || !value.title ||
      !(value.priority === null || typeof value.priority === "string") ||
      !(value.dueOn === null || isDate(value.dueOn)) ||
      !(value.projectId === null || (typeof value.projectId === "string" && uuidPattern.test(value.projectId))) ||
      !Array.isArray(value.linkKinds) || !value.linkKinds.every((kind): kind is string => ["CREATED", "EXECUTOR", "COLLABORATOR"].includes(String(kind))) ||
      typeof value.overdue !== "boolean" || typeof value.dueSoon !== "boolean" || value.href !== `/atividades/${value.activityId}`) return null;
  return { activityId: value.activityId, title: value.title, priority: value.priority, dueOn: value.dueOn,
    projectId: value.projectId, linkKinds: value.linkKinds, overdue: value.overdue, dueSoon: value.dueSoon, href: `/atividades/${value.activityId}` };
}

function parseProject(value: unknown): DashboardProject | null {
  if (!isRecord(value) || typeof value.projectId !== "string" || !uuidPattern.test(value.projectId) ||
      typeof value.title !== "string" || !value.title || typeof value.situation !== "string" ||
      typeof value.leader !== "boolean" || !isCount(value.openActivities) || value.href !== `/projetos/${value.projectId}`) return null;
  return { projectId: value.projectId, title: value.title, situation: value.situation, leader: value.leader,
    openActivities: value.openActivities, href: `/projetos/${value.projectId}` };
}

function parseCommitment(value: unknown): DashboardCommitment | null {
  if (!isRecord(value) || typeof value.id !== "string" || !uuidPattern.test(value.id) ||
      (value.source !== "MEETING" && value.source !== "AGENDA") || typeof value.title !== "string" || !value.title ||
      !isInstant(value.startsAt) || value.href !== (value.source === "MEETING" ? "/reunioes" : "/frequencia")) return null;
  const href = value.source === "MEETING" ? "/reunioes" : "/frequencia";
  return { id: value.id, source: value.source, title: value.title, startsAt: value.startsAt, href };
}

function parseRisk(value: unknown): DashboardRisk | null {
  if (!isRecord(value) || typeof value.projectId !== "string" || !uuidPattern.test(value.projectId) ||
      typeof value.title !== "string" || !value.title || typeof value.health !== "string" ||
      !isCount(value.maxOverdueDays) || typeof value.reason !== "string" ||
      value.href !== `/projetos/${value.projectId}`) return null;
  return { projectId: value.projectId, title: value.title, health: value.health,
    maxOverdueDays: value.maxOverdueDays, reason: value.reason, href: `/projetos/${value.projectId}` };
}

export function parseDashboardContexts(value: unknown): DashboardContext[] | null {
  if (!Array.isArray(value) || !value.every((item): item is DashboardContext => item === "PERSONAL" || item === "INSTITUTIONAL")) return null;
  return [...new Set(value)];
}

export function parseDashboardOverview(value: unknown): DashboardOverview | null {
  if (!isRecord(value) || (value.context !== "PERSONAL" && value.context !== "INSTITUTIONAL") ||
      !isInstant(value.generatedAt) || !isDate(value.asOfDate) || typeof value.timeZone !== "string" || !value.timeZone || !isTimeZone(value.timeZone) ||
      !isDate(value.from) || !isDate(value.to) || value.from > value.to || !isRecord(value.current) ||
      !Array.isArray(value.evolution) || !Array.isArray(value.unavailable)) return null;
  const activities = parseDistribution(value.current.activities);
  const projects = parseCountList(value.current.projects);
  const projectHealth = parseCountList(value.current.projectHealth);
  const risks = parseHighlights(value.risks, parseRisk);
  const actions = parseHighlights(value.actions, parseTask);
  const projectHighlights = parseHighlights(value.projects, parseProject);
  const commitments = parseHighlights(value.commitments, parseCommitment);
  if (!activities || !projects || !projectHealth || !risks || !actions || !projectHighlights || !commitments) return null;
  const projectTotal = projects.reduce((sum, item) => sum + item.total, 0);
  const healthTotal = projectHealth.reduce((sum, item) => sum + item.total, 0);
  const riskTotal = projectHealth.filter((item) => item.situation === "CRITICO" || item.situation === "ATENCAO")
    .reduce((sum, item) => sum + item.total, 0);
  if (activities.planned + activities.inProgress + activities.completed + activities.cancelled !== activities.total ||
      activities.attentionRequired > activities.overdue || activities.dueSoon > activities.total ||
      projectTotal !== healthTotal || projectHighlights.total !== projectTotal || risks.total !== riskTotal) return null;
  const evolution: DashboardEvolution[] = [];
  const eventKeys = new Set<string>();
  for (const item of value.evolution) {
    if (!isRecord(item) || !isDate(item.day) || (item.source !== "ACTIVITY" && item.source !== "PROJECT") ||
        item.day < value.from || item.day > value.to || typeof item.event !== "string" || !item.event || !isCount(item.total)) return null;
    const eventKey = `${item.day}:${item.source}:${item.event}`;
    if (eventKeys.has(eventKey)) return null;
    eventKeys.add(eventKey);
    evolution.push({ day: item.day, source: item.source, event: item.event, total: item.total });
  }
  const unavailable: DashboardOverview["unavailable"] = [];
  for (const item of value.unavailable) {
    if (!isRecord(item) || typeof item.indicator !== "string" || typeof item.reason !== "string") return null;
    unavailable.push({ indicator: item.indicator, reason: item.reason });
  }
  let administrative: DashboardOverview["administrative"] = null;
  const administrativeValue = value.administrative;
  if (administrativeValue !== null) {
    if (!isRecord(administrativeValue)) return null;
    const pendingProposals = countField(administrativeValue, "pendingProposals");
    const pendingInvitations = countField(administrativeValue, "pendingInvitations");
    const failedInvitations = countField(administrativeValue, "failedInvitations");
    const openAttendanceLists = countField(administrativeValue, "openAttendanceLists");
    if (pendingProposals === null || pendingInvitations === null || failedInvitations === null || openAttendanceLists === null) return null;
    administrative = {
      pendingProposals, pendingInvitations, failedInvitations, openAttendanceLists,
    };
  }
  return { context: value.context, generatedAt: value.generatedAt, asOfDate: value.asOfDate, timeZone: value.timeZone,
    from: value.from, to: value.to, current: { activities, projects, projectHealth }, risks, evolution, actions,
    projects: projectHighlights, commitments, administrative, unavailable };
}
