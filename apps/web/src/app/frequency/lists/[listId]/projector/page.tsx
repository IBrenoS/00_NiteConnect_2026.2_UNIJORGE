import { notFound, redirect } from "next/navigation";
import { ProjectorScreen } from "../../../../../components/frequency/projector-screen";
import { requireAuthenticatedNiteSession } from "../../../../../lib/auth/server-session";
import { getFrequencyList } from "../../../../../lib/frequency/data";
import { canManageFrequency } from "../../../../../lib/frequency/query";
import { qrSvgFromProjectorCookie } from "../../../../../lib/frequency/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projeção da lista · Frequência" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FrequencyProjectorPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  if (!uuid.test(listId)) notFound();
  const session = await requireAuthenticatedNiteSession();
  if (!canManageFrequency(session.roles)) redirect("/frequencia");
  const result = await getFrequencyList(session.bearer, listId);
  if (!result.data) notFound();
  const initialQr = result.data.status === "ABERTA" ? await qrSvgFromProjectorCookie(listId) : null;
  return <ProjectorScreen initialList={{ listId: result.data.listId, meetingName: result.data.meetingName, status: result.data.status, openedAt: result.data.openedAt, confirmationDeadline: result.data.confirmationDeadline, version: result.data.version, qr: result.data.qr ? { version: result.data.qr.version, expiresAt: result.data.qr.expiresAt } : null }} initialSvg={initialQr?.svg ?? null} initialQrExpiresAt={initialQr?.expiresAt ?? null} />;
}
