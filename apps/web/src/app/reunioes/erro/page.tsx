import type { Metadata } from "next";
import { MeetingJoinErrorView } from "../../../components/meetings/meeting-join-error-view";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { parseMeetingJoinErrorReason } from "../../../lib/meetings/meeting-join-feedback";

export const metadata: Metadata = { title: "Acesso à reunião" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MeetingJoinErrorPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAuthenticatedNiteSession();
  const params = await searchParams;
  const reason = parseMeetingJoinErrorReason(params.reason) ?? "unavailable";
  const possibleId = Array.isArray(params.meetingId) ? params.meetingId[0] : params.meetingId;
  const meetingId = possibleId && uuidPattern.test(possibleId) ? possibleId : null;

  return <MeetingJoinErrorView reason={reason} meetingId={meetingId} />;
}
