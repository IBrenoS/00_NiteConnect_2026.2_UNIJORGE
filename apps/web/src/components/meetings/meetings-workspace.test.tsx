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

  it("renders meeting details with one discreet close control and truthful history", () => {
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialOverlay="history"
        upcoming={previewUpcoming}
        past={previewPast}
        cancelled={previewCancelled}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="available"
      />,
    );

    expect(html.match(/aria-label="Fechar detalhes da reunião"/g)).toHaveLength(1);
    expect(html).not.toContain(">Fechar</button>");
    expect(html).toContain(historicalMeeting.title);
    expect(html).toContain("Link disponível");
    expect(html).toContain("60 min de duração prevista");
    expect(html).toContain("Respostas registradas no NITE Connect");
    expect(html).toContain("AC");
    expect(html).toContain("CM");
    expect(html).not.toContain("Este é um registro anterior à integração automática");
    expect(html).not.toContain("Duração efetiva");
  });

  it("keeps internal invitation responses and contextual actions in meeting details", () => {
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialOverlay="invite"
        upcoming={previewUpcoming}
        past={previewPast}
        cancelled={previewCancelled}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="available"
      />,
    );

    expect(html).toContain("Respostas registradas no NITE Connect");
    expect(html).toContain("Pendente");
    expect(html).toContain("Aceitar convite");
    expect(html).toContain("Recusar");
    expect(html).toContain("Entrar no Teams");
    expect(html).toContain(">Copiar link</button>");
    expect(html).not.toContain("Cancelar reunião");
    expect(html).not.toContain("Editar");
  });

  it("renders four synthetic invitees with distinct internal response states", () => {
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialOverlay="invite"
        upcoming={previewUpcoming}
        past={previewPast}
        cancelled={previewCancelled}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="available"
      />,
    );

    expect(html).toContain("Ana Paula Santos");
    expect(html).toContain("João Lima");
    expect(html).toContain("Pendente");
    expect(html).toContain("Aceito");
    expect(html).toContain("Recusado");
    expect(html).toContain("Revogado");
  });

  it("shows effective duration only when it exists in the meeting record", () => {
    const measuredMeeting = {
      ...historicalMeeting,
      actualStartsAt: "2026-10-28T17:10:00Z",
      actualEndsAt: "2026-10-28T17:45:00Z",
      actualDurationSeconds: 2_100,
    };
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialOverlay="history"
        upcoming={previewUpcoming}
        past={{ ...previewPast, items: [measuredMeeting] }}
        cancelled={previewCancelled}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="available"
      />,
    );

    expect(html).toContain("Duração efetiva: 35 min");
  });

  it("does not offer participation or organizer actions for canceled details", () => {
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialOverlay="cancelled"
        upcoming={previewUpcoming}
        past={previewPast}
        cancelled={previewCancelled}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="available"
      />,
    );

    expect(html).toContain(cancelledMeeting.title);
    expect(html).toContain("Cancelada");
    expect(html).not.toContain("Convidados <span class=\"font-normal text-nite-text-secondary\">(0)</span>");
    expect(html).not.toContain("O cancelamento foi registrado no NITE Connect");
    expect(html).toContain("data-icon=\"video\"");
    expect(html).not.toContain("Entrar no Teams");
    expect(html).not.toContain("Copiar link autorizado");
    expect(html).not.toContain("Cancelar reunião");
  });

  it("shows the unsynchronized cancellation note only for the matching legacy state", () => {
    const legacyCancelledMeeting = {
      ...cancelledMeeting,
      provider: "TEAMS_LINK" as const,
      providerState: "CANCELAMENTO_NAO_SINCRONIZADO" as const,
    };
    const html = renderToStaticMarkup(
      <MeetingsWorkspace
        viewerId={previewViewerId}
        previewMode
        initialOverlay="cancelled"
        upcoming={previewUpcoming}
        past={previewPast}
        cancelled={{ ...previewCancelled, items: [legacyCancelledMeeting] }}
        notifications={null}
        upcomingIssue={null}
        pastIssue={null}
        cancelledIssue={null}
        notificationIssue={null}
        upcomingPage={0}
        pastPage={0}
        cancelledPage={0}
        initialGraphAvailability="available"
      />,
    );

    expect(html).toContain("O cancelamento foi registrado no NITE Connect. Essa ação não altera o Teams");
    expect(html).not.toContain("compromisso antigo do Teams não foi atualizado automaticamente");
  });
});
