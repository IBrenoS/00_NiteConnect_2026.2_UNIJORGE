import type { Metadata } from "next";
import { DashboardOverviewView } from "../../../components/dashboard/dashboard-overview";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getDashboardContexts, getDashboardOverview } from "../../../lib/dashboard/overview-data";
import type { ApiResult } from "../../../lib/api/contracts";
import type { DashboardContext, DashboardOverview } from "../../../lib/dashboard/overview-contracts";

export const metadata: Metadata = { title: "Visão Geral" };
export const dynamic = "force-dynamic";

type Period = "7" | "30" | "90";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function dayInBahia(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function periodWindow(period: Period, now = new Date()): { from: string; to: string } {
  const to = dayInBahia(now);
  const end = Date.parse(`${to}T12:00:00Z`);
  const offset = Number(period) - 1;
  const from = new Date(end - offset * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

function isPeriod(value: string | undefined): value is Period {
  return value === "7" || value === "30" || value === "90";
}

function matchesWindow(data: DashboardOverview, context: DashboardContext, from: string, to: string): boolean {
  return data.context === context && data.from === from && data.to === to;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const identity = await requireAuthenticatedNiteSession();
  const requestedPeriod = first(params.period);
  const period: Period = isPeriod(requestedPeriod) ? requestedPeriod : "30";
  const { from, to } = periodWindow(period);
  const institutionalRole = identity.roles.some((role) => role === "GESTOR_GERAL" || role === "COORDENADOR");
  const contextsResult = await getDashboardContexts(identity.bearer);
  const allowedContexts = contextsResult.data?.filter((context) => context === "PERSONAL" || (context === "INSTITUTIONAL" && institutionalRole)) ?? [];
  const requestedInstitutional = first(params.context) === "institutional";
  let context: "personal" | "institutional" = requestedInstitutional && allowedContexts.includes("INSTITUTIONAL") ? "institutional" : "personal";
  let result: ApiResult<DashboardOverview> | null = null;
  const contextIssue = contextsResult.issue;

  if (!contextIssue && allowedContexts.includes("PERSONAL")) {
    let apiContext: DashboardContext = context === "institutional" ? "INSTITUTIONAL" : "PERSONAL";
    result = await getDashboardOverview(identity.bearer, apiContext, from, to);

    if (context === "institutional" && result.issue === "access") {
      context = "personal";
      allowedContexts.splice(allowedContexts.indexOf("INSTITUTIONAL"), 1);
      apiContext = "PERSONAL";
      result = await getDashboardOverview(identity.bearer, apiContext, from, to);
    }

    if (result.data && !matchesWindow(result.data, apiContext, from, to)) result = { data: null, issue: "invalid" };
  } else if (!contextIssue) {
    result = { data: null, issue: "access" };
  }

  return <DashboardOverviewView
    context={context}
    allowedContexts={allowedContexts}
    period={period}
    from={from}
    to={to}
    result={result}
    contextIssue={contextIssue}
    showLeadership={identity.roles.includes("GESTOR_PROJETO")}
  />;
}
