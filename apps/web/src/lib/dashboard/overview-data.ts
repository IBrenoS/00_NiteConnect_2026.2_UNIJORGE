import "server-only";

import { getApiJson } from "../api/server";
import type { ApiResult } from "../api/contracts";
import { parseDashboardContexts, parseDashboardOverview, type DashboardContext, type DashboardOverview } from "./overview-contracts";

export function getDashboardContexts(bearer: string): Promise<ApiResult<DashboardContext[]>> {
  return getApiJson("/api/v1/dashboard/contexts", bearer, parseDashboardContexts);
}

export function getDashboardOverview(
  bearer: string,
  context: DashboardContext,
  from: string,
  to: string,
): Promise<ApiResult<DashboardOverview>> {
  const query = new URLSearchParams({ from, to });
  const endpoint = context === "INSTITUTIONAL" ? "institutional" : "personal";
  return getApiJson(`/api/v1/dashboard/${endpoint}?${query}`, bearer, parseDashboardOverview);
}
