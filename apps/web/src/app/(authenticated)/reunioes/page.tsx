import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireAuthenticatedNiteSession } from "../../../lib/auth/server-session";
import { getMeetingNotifications, getMeetings } from "../../../lib/meetings/data";
import { meetingGraphHelpHref } from "../../../lib/meetings/graph-help-link";
import type { MeetingIssue } from "../../../lib/meetings/contracts";
import { parseMeetingJoinFeedback } from "../../../lib/meetings/meeting-join-feedback";
import { MeetingsWorkspace } from "../../../components/meetings/meetings-workspace";

export const metadata: Metadata = { title: "Reuniões" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pageNumber(value: string | string[] | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || !/^(0|[1-9]\d{0,5})$/.test(first)) return 0;
  const parsed = Number(first);
  return Number.isSafeInteger(parsed) ? Math.min(parsed, 10_000) : 0;
}

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [session, params, requestHeaders] = await Promise.all([requireAuthenticatedNiteSession(), searchParams, headers()]);
  const joinFeedback = parseMeetingJoinFeedback(params.feedback);
  const upcomingPage = pageNumber(params.upcomingPage);
  const pastPage = pageNumber(params.pastPage);
  const cancelledPage = pageNumber(params.cancelledPage);
  const [upcomingResult, pastResult, cancelledResult, notificationResult] = await Promise.all([
    getMeetings(session.bearer, "upcoming", upcomingPage),
    getMeetings(session.bearer, "past", pastPage),
    getMeetings(session.bearer, "cancelled", cancelledPage),
    getMeetingNotifications(session.bearer),
  ]);
  const issue = (value: typeof upcomingResult): MeetingIssue | null => value.issue;

  return <MeetingsWorkspace
    viewerId={session.member.id}
    upcoming={upcomingResult.data}
    past={pastResult.data}
    cancelled={cancelledResult.data}
    notifications={notificationResult.data}
    upcomingIssue={issue(upcomingResult)}
    pastIssue={issue(pastResult)}
    cancelledIssue={issue(cancelledResult)}
    notificationIssue={notificationResult.issue}
    upcomingPage={upcomingPage}
    pastPage={pastPage}
    cancelledPage={cancelledPage}
    initialJoinFeedback={joinFeedback}
    graphHelpHref={meetingGraphHelpHref(process.env.NODE_ENV, requestHeaders.get("host"))}
  />;
}
