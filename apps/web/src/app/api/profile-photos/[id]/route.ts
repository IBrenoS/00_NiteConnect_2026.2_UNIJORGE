import { getAuthenticatedNiteSession } from "../../../../lib/auth/server-session";
import { resolveApiUrl } from "../../../../lib/api/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedNiteSession();
  if (!session) return new Response(null, { status: 401 });
  const { id } = await context.params;
  if (!uuid.test(id)) return new Response(null, { status: 404 });
  const url = resolveApiUrl(`/api/v1/members/${id}/photo`);
  if (!url) return new Response(null, { status: 503 });
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.bearer}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return new Response(null, { status: response.status === 404 ? 404 : 503,
      headers: { "Cache-Control": "no-store" } });
    const type = response.headers.get("content-type");
    if (type !== "image/jpeg" && type !== "image/png") return new Response(null, { status: 502 });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2 * 1024 * 1024) return new Response(null, { status: 502 });
    return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
