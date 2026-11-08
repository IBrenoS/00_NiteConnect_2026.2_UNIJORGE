import "server-only";
import { getApiJson, resolveApiUrl } from "../api/server";

type DocumentSummary = { id: string; title: string; revision: number; size: number; sha256: string };
type DocumentLaunch = { actionUrl: string; accessToken: string; accessTokenTtl: number; wopiSrc: string };

function documentSummary(value: unknown): DocumentSummary | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !/^[a-f\d-]{36}$/i.test(item.id) || typeof item.title !== "string"
      || typeof item.revision !== "number" || typeof item.size !== "number" || typeof item.sha256 !== "string") return null;
  return { id: item.id, title: item.title, revision: item.revision, size: item.size, sha256: item.sha256 };
}

export async function getMyDocuments(bearer: string) {
  return getApiJson("/api/v1/me/documents", bearer, (value) => {
    if (!Array.isArray(value)) return null;
    const parsed = value.map(documentSummary);
    return parsed.every(Boolean) ? parsed as DocumentSummary[] : null;
  });
}

export async function getDocument(bearer: string, id: string) {
  return getApiJson(`/api/v1/documents/${encodeURIComponent(id)}`, bearer, documentSummary);
}

export async function getEditorLaunch(bearer: string, id: string): Promise<DocumentLaunch | null> {
  const url = resolveApiUrl(`/api/v1/documents/${encodeURIComponent(id)}/editor-session`);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: "POST", headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const value = await response.json() as Partial<DocumentLaunch>;
    if (typeof value.actionUrl !== "string" || typeof value.accessToken !== "string"
        || typeof value.accessTokenTtl !== "number" || typeof value.wopiSrc !== "string") return null;
    const action = new URL(value.actionUrl);
    // The browser may submit only to the configured Collabora origin, not to arbitrary URLs.
    const expected = process.env.COLLABORA_BROWSER_ORIGIN;
    if (!expected || action.origin !== new URL(expected).origin || value.accessToken.length < 32) return null;
    return { actionUrl: value.actionUrl, accessToken: value.accessToken, accessTokenTtl: value.accessTokenTtl, wopiSrc: value.wopiSrc };
  } catch { return null; }
}
