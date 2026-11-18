"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { activityPriorities, activityStatuses, parseActivity } from "./contracts";
import { getActivity, getActivityCapabilities, getActivityEvidenceById, getEvidenceCapabilities, getMyActivityCapabilities } from "./data";
import { mutateActivity, uploadActivityEvidence, type ActivityMutationIssue } from "./mutations";
import { getAuthenticatedNiteSession } from "../auth/server-session";
import { MAX_ACTIVITY_EVIDENCE_BYTES } from "./limits";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Feedback = "created" | "updated" | "status" | "evidence" | "upload" | "assigned" | "removed" | "withdrawn" | "deleted" | "invalid" | "forbidden" | "not-found" | "conflict" | "too-large" | "unsupported" | "unavailable";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function version(form: FormData): number | null {
  const value = field(form, "expectedVersion");
  if (!/^\d{1,12}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function safeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/atividades") || value.startsWith("//") || value.includes("\\")) return "/atividades";
  try {
    const url = new URL(value, "https://nite-connect.invalid");
    return url.origin === "https://nite-connect.invalid" && url.pathname === "/atividades" ? `${url.pathname}${url.search}` : "/atividades";
  } catch {
    return "/atividades";
  }
}

function detailTarget(id: string, feedback: Feedback, returnTo: string): string {
  const query = new URLSearchParams({ feedback, from: returnTo });
  return `/atividades/${encodeURIComponent(id)}?${query}`;
}

function resultFeedback(issue: ActivityMutationIssue): Feedback {
  if (issue === "access") return "forbidden";
  if (issue === "not-found") return "not-found";
  if (issue === "conflict") return "conflict";
  if (issue === "too-large") return "too-large";
  if (issue === "unsupported") return "unsupported";
  if (issue === "invalid") return "invalid";
  return "unavailable";
}

async function requireSessionOrRedirect(): Promise<NonNullable<Awaited<ReturnType<typeof getAuthenticatedNiteSession>>>> {
  const session = await getAuthenticatedNiteSession();
  if (!session) redirect("/login");
  return session;
}

async function requireActivityCapability(id: string, bearer: string, capability: "edit" | "transitions" | "manageAssignees" | "addEvidence" | "upload"): Promise<Feedback | null> {
  const result = await getActivityCapabilities(bearer, id);
  if (result.issue) return resultFeedback(result.issue);
  if (!result.data) return "unavailable";
  const allowed = capability === "transitions" ? result.data.transitions.length > 0 : result.data[capability];
  return allowed ? null : "forbidden";
}

function revalidateActivity(id: string): void {
  revalidatePath("/atividades");
  revalidatePath(`/atividades/${id}`);
}

export async function createIndependentActivityAction(form: FormData): Promise<void> {
  const session = await requireSessionOrRedirect();
  const returnTo = "/atividades";
  const capability = await getMyActivityCapabilities(session.bearer);
  if (capability.issue || !capability.data?.createIndependent) redirect(`${returnTo}?feedback=${capability.issue === "access" ? "forbidden" : "unavailable"}`);

  const title = field(form, "title");
  const description = field(form, "description");
  const startOn = field(form, "startOn");
  const dueOn = field(form, "dueOn");
  const priorityValue = field(form, "priority");
  const priority = activityPriorities.find((value) => value === priorityValue) ?? null;
  const reason = field(form, "reason");
  if (!title || title.length > 200 || description.length > 10_000 || !validDate(startOn) || !validDate(dueOn) || (priorityValue && !priority) || reason.length > 1_000) redirect(`${returnTo}?feedback=invalid`);

  const result = await mutateActivity("/api/v1/activities", session.bearer, "POST", {
    title,
    description,
    startOn: startOn || null,
    dueOn: dueOn || null,
    priority,
    primaryExecutorId: session.member.id,
    ...(reason ? { reason } : {}),
  }, parseActivity);
  if (result.issue || !result.data) redirect(`${returnTo}?feedback=${result.issue ? resultFeedback(result.issue) : "unavailable"}`);
  revalidateActivity(result.data.id);
  redirect(detailTarget(result.data.id, "created", returnTo));
}

export async function updateActivityAction(id: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  const capabilityFeedback = await requireActivityCapability(id, session.bearer, "edit");
  if (capabilityFeedback) redirect(target(capabilityFeedback));

  const title = field(form, "title");
  const description = field(form, "description");
  const startOn = field(form, "startOn");
  const dueOn = field(form, "dueOn");
  const priorityValue = field(form, "priority");
  const priority = activityPriorities.find((value) => value === priorityValue) ?? null;
  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!title || title.length > 200 || description.length > 10_000 || !validDate(startOn) || !validDate(dueOn) || (priorityValue && !priority) || reason.length > 1_000 || expectedVersion === null) redirect(target("invalid"));

  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}`, session.bearer, "PATCH", {
    title,
    description,
    startOn: startOn || null,
    dueOn: dueOn || null,
    priority,
    expectedVersion,
    ...(reason ? { reason } : {}),
  });
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("updated"));
}

export async function moveActivityAction(
  id: string,
  expectedVersion: number,
  fieldName: "status" | "priority",
  value: string | null,
): Promise<{ issue: ActivityMutationIssue | "forbidden" | null }> {
  if (!uuidPattern.test(id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) return { issue: "invalid" };
  const session = await getAuthenticatedNiteSession();
  if (!session) return { issue: "access" };
  const current = await getActivity(session.bearer, id);
  if (current.issue) return { issue: current.issue };
  if (current.data.version !== expectedVersion) return { issue: "conflict" };
  const capability = await getActivityCapabilities(session.bearer, id);
  if (capability.issue) return { issue: capability.issue };
  if (!capability.data) return { issue: "unavailable" };

  let result;
  if (fieldName === "status") {
    const next = activityStatuses.find((status) => status === value);
    if (!next || next === "CANCELADA" || current.data.status === "CONCLUIDA" || current.data.status === "CANCELADA" || !capability.data.transitions.includes(next)) return { issue: "forbidden" };
    result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}/status`, session.bearer, "PATCH", { status: next, expectedVersion });
  } else {
    const priority = value === null ? null : activityPriorities.find((item) => item === value) ?? undefined;
    if (priority === undefined || !capability.data.changePriority || current.data.status === "CONCLUIDA" || current.data.status === "CANCELADA") return { issue: "forbidden" };
    result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}`, session.bearer, "PATCH", { priority, expectedVersion });
  }

  if (result.issue) return { issue: result.issue };
  revalidateActivity(id);
  return { issue: null };
}

export async function deleteActivityAction(id: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => `/atividades?feedback=${feedback}`;
  const session = await requireSessionOrRedirect();
  const capabilities = await getActivityCapabilities(session.bearer, id);
  if (capabilities.issue || !capabilities.data?.canDelete) redirect(target(capabilities.issue === "access" ? "forbidden" : capabilities.issue === "not-found" ? "not-found" : "unavailable"));
  const expectedVersion = version(form);
  if (expectedVersion === null || field(form, "confirmed") !== "true") redirect(detailTarget(id, "invalid", returnTo));
  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}`, session.bearer, "DELETE", { expectedVersion, confirmed: true });
  if (result.issue) redirect(detailTarget(id, resultFeedback(result.issue), returnTo));
  revalidateActivity(id);
  redirect(target("deleted"));
}

export async function transitionActivityAction(id: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  const capabilityFeedback = await requireActivityCapability(id, session.bearer, "transitions");
  if (capabilityFeedback) redirect(target(capabilityFeedback));

  const statusValue = field(form, "status");
  const status = (["PLANEJADA", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"] as const).find((value) => value === statusValue);
  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!status) redirect(target("invalid"));
  const current = await getActivity(session.bearer, id);
  if (current.issue || !current.data) redirect(target(current.issue === "not-found" ? "not-found" : current.issue === "access" ? "forbidden" : "unavailable"));
  const confirmationRequired = status === "CANCELADA" || current.data.status === "CONCLUIDA" || current.data.status === "CANCELADA";
  if (confirmationRequired && field(form, "confirmed") !== "true") redirect(target("invalid"));
  if (!activityStatuses.some((value) => value === status) || reason.length > 1_000 || expectedVersion === null) redirect(target("invalid"));
  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}/status`, session.bearer, "PATCH", {
    status,
    expectedVersion,
    ...(reason ? { reason } : {}),
    ...(confirmationRequired ? { confirmed: true } : {}),
  });
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("status"));
}

export async function addActivityEvidenceAction(id: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  const capabilityFeedback = await requireActivityCapability(id, session.bearer, "addEvidence");
  if (capabilityFeedback) redirect(target(capabilityFeedback));

  const typeValue = field(form, "type");
  const type = (["TEXT", "TECHNICAL", "LINK"] as const).find((value) => value === typeValue);
  const content = field(form, "content");
  const url = field(form, "url");
  const correctsEvidenceId = field(form, "correctsEvidenceId");
  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!type) redirect(target("invalid"));
  if (!(["TEXT", "TECHNICAL", "LINK"] as const).some((value) => value === type) || !reason || reason.length > 1_000 || expectedVersion === null || (correctsEvidenceId && !uuidPattern.test(correctsEvidenceId))) redirect(target("invalid"));
  if (type === "LINK") {
    if (!url || url.length > 2_048 || /[\u0000-\u0020\u007f-\u009f]/.test(url)) redirect(target("invalid"));
    try {
      const parsed = new URL(url);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) redirect(target("invalid"));
    } catch {
      redirect(target("invalid"));
    }
  } else if (!content || content.length > 10_000) redirect(target("invalid"));

  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}/evidence`, session.bearer, "POST", {
    type,
    content: type === "LINK" ? null : content,
    url: type === "LINK" ? url : null,
    expectedVersion,
    reason,
    ...(correctsEvidenceId ? { correctsEvidenceId } : {}),
  });
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("evidence"));
}

export async function uploadActivityEvidenceAction(id: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  const capabilityFeedback = await requireActivityCapability(id, session.bearer, "upload");
  if (capabilityFeedback) redirect(target(capabilityFeedback));

  const file = form.get("file");
  const correctsEvidenceId = field(form, "correctsEvidenceId");
  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!(file instanceof File) || file.size < 1 || !reason || reason.length > 1_000 || expectedVersion === null || (correctsEvidenceId && !uuidPattern.test(correctsEvidenceId))) redirect(target("invalid"));
  if (file.size > MAX_ACTIVITY_EVIDENCE_BYTES) redirect(target("too-large"));
  const metadata = new Blob([JSON.stringify({ expectedVersion, reason, ...(correctsEvidenceId ? { correctsEvidenceId } : {}) })], { type: "application/json" });
  const upload = new FormData();
  upload.append("file", file, file.name);
  upload.append("metadata", metadata);
  const result = await uploadActivityEvidence(id, session.bearer, upload);
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("upload"));
}

export async function changeActivityExecutorAction(id: string, form: FormData): Promise<void> {
  await assignActivityParticipant(id, form, "executor");
}

export async function addActivityCollaboratorAction(id: string, form: FormData): Promise<void> {
  await assignActivityParticipant(id, form, "collaborator");
}

async function assignActivityParticipant(id: string, form: FormData, role: "executor" | "collaborator"): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  const capabilityFeedback = await requireActivityCapability(id, session.bearer, "manageAssignees");
  if (capabilityFeedback) redirect(target(capabilityFeedback));
  const memberId = field(form, "memberId");
  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!uuidPattern.test(memberId) || !reason || reason.length > 1_000 || expectedVersion === null) redirect(target("invalid"));
  if (role === "executor" && field(form, "confirmed") !== "true") redirect(target("invalid"));
  const path = role === "executor" ? `/api/v1/activities/${encodeURIComponent(id)}/executor` : `/api/v1/activities/${encodeURIComponent(id)}/collaborators`;
  const result = await mutateActivity(path, session.bearer, role === "executor" ? "PUT" : "POST", {
    memberId,
    expectedVersion,
    reason,
    ...(role === "executor" ? { confirmed: true } : {}),
  });
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("assigned"));
}

export async function removeActivityCollaboratorAction(id: string, memberId: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id) || !uuidPattern.test(memberId)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  const capabilityFeedback = await requireActivityCapability(id, session.bearer, "manageAssignees");
  if (capabilityFeedback) redirect(target(capabilityFeedback));
  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!reason || reason.length > 1_000 || expectedVersion === null) redirect(target("invalid"));
  if (field(form, "confirmed") !== "true") redirect(target("invalid"));
  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}/collaborators/${encodeURIComponent(memberId)}`, session.bearer, "DELETE", { expectedVersion, reason });
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("removed"));
}

export async function withdrawActivityEvidenceAction(id: string, evidenceId: string, form: FormData): Promise<void> {
  const returnTo = safeReturnTo(form.get("returnTo"));
  if (!uuidPattern.test(id) || !uuidPattern.test(evidenceId)) redirect(`${returnTo}?feedback=not-found`);
  const target = (feedback: Feedback) => detailTarget(id, feedback, returnTo);
  const session = await requireSessionOrRedirect();
  if (field(form, "confirmed") !== "true") redirect(target("invalid"));
  const [evidence, authorized] = await Promise.all([
    getActivityEvidenceById(session.bearer, id, evidenceId),
    getEvidenceCapabilities(session.bearer, id, evidenceId),
  ]);
  if (evidence.issue || !evidence.data || evidence.data.withdrawnAt !== null || authorized.issue || !authorized.data?.withdraw) redirect(target("forbidden"));

  const reason = field(form, "reason");
  const expectedVersion = version(form);
  if (!reason || reason.length > 1_000 || expectedVersion === null) redirect(target("invalid"));
  const result = await mutateActivity(`/api/v1/activities/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/withdraw`, session.bearer, "POST", { expectedVersion, reason, confirmed: true });
  if (result.issue) redirect(target(resultFeedback(result.issue)));
  revalidateActivity(id);
  redirect(target("withdrawn"));
}
