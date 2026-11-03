import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MeetingsWorkspace } from "./meetings-workspace";
import { cancelledMeeting, graphMeeting, historicalMeeting, previewCancelled, previewNotifications, previewPast, previewUpcoming, previewViewerId } from "../../lib/meetings/preview-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../lib/meetings/actions", () => ({
  cancelMeetingAction: vi.fn(),
  getMeetingGraphAvailabilityAction: vi.fn(),
  getMeetingShareAction: vi.fn(),
  loadMeetingPageAction: vi.fn(),
  markMeetingNotificationReadAction: vi.fn(),
  respondToMeetingInviteAction: vi.fn(),
}));

describe("MeetingsWorkspace", () => {
  it("uses one temporal filter and keeps canceled meetings out of the upcoming list", () => {
    const upcomingWithDuplicateCancellation = {
      ...previewUpcoming,
      items: [graphMeeting, cancelledMeeting],
    };
    const pastWithDuplicateCancellation = {
      ...previewPast,
      items: [previewPast.items[0], cancelledMeeting],
    };
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialListFilter="upcoming"
        upcoming={upcomingWithDuplicateCancellation}
        past={pastWithDuplicateCancellation}
        cancelled={previewCancelled}
        notifications={previewNotifications}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="consent-required"
      />,
    );

    expect(html).toContain('aria-label="Filtro temporal das reuniões"');
    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Próximas<\/span><\/button>/);
    expect(html).toMatch(/aria-pressed="false"[^>]*><span[^>]*>Anteriores<\/span><\/button>/);
    expect(html).toMatch(/aria-pressed="false"[^>]*><span[^>]*>Canceladas<\/span><\/button>/);
    expect(html).toContain('data-icon="video"');
    expect(html).not.toContain(cancelledMeeting.title);
  });

  it("shows canceled meetings only in the canceled temporal group", () => {
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialListFilter="cancelled"
        upcoming={previewUpcoming}
        past={previewPast}
        cancelled={previewCancelled}
        notifications={previewNotifications}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="consent-required"
      />,
    );

    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Canceladas<\/span><\/button>/);
    expect(html).toContain(cancelledMeeting.title);
    expect(html).not.toContain(graphMeeting.title);
  });

  it("does not repeat a meeting returned by both upcoming and past scopes", () => {
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialListFilter="past"
        upcoming={previewUpcoming}
        past={{ ...previewPast, items: [historicalMeeting, graphMeeting] }}
        cancelled={previewCancelled}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="consent-required"
      />,
    );

    expect(html).toContain(historicalMeeting.title);
    expect(html).not.toContain(graphMeeting.title);
  });
});
