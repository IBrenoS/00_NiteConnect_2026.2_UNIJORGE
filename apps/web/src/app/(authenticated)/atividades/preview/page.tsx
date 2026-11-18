import { ActivityPlanningPreview } from "../../../../components/activity-planning-preview/activity-planning-preview";

export const metadata = { title: "Preview — Minhas atividades" };

type PreviewScreen = "plannings" | "create-planning" | "workspace" | "priority" | "status" | "table" | "task-form" | "empty" | "legacy-tasks";
const screens: readonly PreviewScreen[] = ["plannings", "create-planning", "workspace", "priority", "status", "table", "task-form", "empty", "legacy-tasks"];

export default async function ActivityPlanningPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const requested = query.tela;
  const screen = screens.find((candidate) => candidate === requested) ?? "plannings";
  const planningId = typeof query.planejamento === "string" ? Number(query.planejamento) : screen === "empty" ? 4 : 1;
  return <ActivityPlanningPreview screen={screen} planningId={Number.isSafeInteger(planningId) && planningId > 0 ? planningId : 1} />;
}
