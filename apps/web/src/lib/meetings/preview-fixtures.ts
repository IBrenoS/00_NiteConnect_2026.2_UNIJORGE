import type { Meeting, MeetingCandidate, MeetingNotification, MeetingPage } from "./contracts";

export const previewViewerId = "87000000-0000-4000-8000-000000000001";
const organizerId = "87000000-0000-4000-8000-000000000002";
const inviteeId = "87000000-0000-4000-8000-000000000003";
const thirdMemberId = "87000000-0000-4000-8000-000000000004";

function meeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: "87000000-0000-4000-8000-000000000010",
    mode: "SCHEDULED",
    status: "AGUARDANDO_TEAMS",
    provider: "TEAMS_LINK",
    providerState: "AGUARDANDO_CRIACAO_NO_TEAMS",
    title: "Reunião de alinhamento",
    startsAt: "2026-11-05T15:00:00Z",
    plannedDurationMinutes: 60,
    plannedEndsAt: "2026-11-05T16:00:00Z",
    actualStartsAt: null,
    actualEndsAt: null,
    actualDurationSeconds: null,
    organizerMemberId: previewViewerId,
    organizerName: "Integrante NITE",
    invitees: [],
    version: 1,
    createdAt: "2026-11-02T12:00:00Z",
    updatedAt: "2026-11-02T12:00:00Z",
    ...overrides,
  };
}

export const preparedMeeting = meeting({
  id: "87000000-0000-4000-8000-000000000011",
  mode: "IMMEDIATE",
  title: "Alinhamento rápido da equipe",
  startsAt: "2026-11-02T18:00:00Z",
  plannedEndsAt: "2026-11-02T19:00:00Z",
  invitees: [
    { memberId: inviteeId, name: "Ana Costa", internalStatus: "ACEITO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-11-02T12:05:00Z", version: 1 },
    { memberId: thirdMemberId, name: "Caio Mendes", internalStatus: "PENDENTE", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: null, version: 0 },
  ],
});

export const invitedMeeting = meeting({
  id: "87000000-0000-4000-8000-000000000012",
  status: "AGENDADA",
  provider: "GRAPH",
  providerState: null,
  title: "Planejamento editorial",
  startsAt: "2026-11-03T16:00:00Z",
  plannedEndsAt: "2026-11-03T17:00:00Z",
  organizerMemberId: organizerId,
  organizerName: "Marina Oliveira",
  invitees: [
    { memberId: previewViewerId, name: "Integrante NITE", internalStatus: "PENDENTE", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: null, version: 0 },
    { memberId: thirdMemberId, name: "Caio Mendes", internalStatus: "ACEITO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-11-02T11:50:00Z", version: 1 },
    { memberId: "87000000-0000-4000-8000-000000000005", name: "Ana Paula Santos", internalStatus: "RECUSADO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-11-02T12:00:00Z", version: 1 },
    { memberId: "87000000-0000-4000-8000-000000000006", name: "João Lima", internalStatus: "REVOGADO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: null, version: 1 },
  ],
});

export const linkedMeeting = meeting({
  id: "87000000-0000-4000-8000-000000000013",
  status: "AGENDADA",
  providerState: "LINK_CONFIRMADO_PELO_ORGANIZADOR",
  title: "Revisão de projeto",
  startsAt: "2026-11-04T18:30:00Z",
  plannedEndsAt: "2026-11-04T19:30:00Z",
  organizerMemberId: organizerId,
  organizerName: "Marina Oliveira",
  invitees: [{ memberId: previewViewerId, name: "Integrante NITE", internalStatus: "ACEITO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-11-02T11:50:00Z", version: 1 }],
});

export const graphMeeting = meeting({
  id: "87000000-0000-4000-8000-000000000015",
  status: "AGENDADA",
  provider: "GRAPH",
  providerState: null,
  title: "Planejamento semanal",
  startsAt: "2026-11-06T13:00:00Z",
  plannedEndsAt: "2026-11-06T14:00:00Z",
  organizerMemberId: previewViewerId,
  invitees: [
    { memberId: inviteeId, name: "Ana Costa", internalStatus: "PENDENTE", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: null, version: 0 },
    { memberId: thirdMemberId, name: "Caio Mendes", internalStatus: "ACEITO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-11-02T11:50:00Z", version: 1 },
  ],
});

export const cancelledMeeting = meeting({
  id: "87000000-0000-4000-8000-000000000016",
  status: "CANCELADA",
  provider: "GRAPH",
  providerState: null,
  title: "Revisão de pauta",
  startsAt: "2026-11-07T13:00:00Z",
  plannedEndsAt: "2026-11-07T14:00:00Z",
});

export const historicalMeeting = meeting({
  id: "87000000-0000-4000-8000-000000000014",
  status: "AGENDADA",
  providerState: "LINK_CONFIRMADO_PELO_ORGANIZADOR",
  title: "Retrospectiva de outubro",
  startsAt: "2026-10-28T17:00:00Z",
  plannedEndsAt: "2026-10-28T18:00:00Z",
  actualStartsAt: null,
  actualEndsAt: null,
  actualDurationSeconds: null,
  invitees: [
    { memberId: inviteeId, name: "Ana Costa", internalStatus: "ACEITO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-10-27T12:00:00Z", version: 1 },
    { memberId: thirdMemberId, name: "Caio Mendes", internalStatus: "RECUSADO", calendarResponseStatus: "NAO_SINCRONIZADO", respondedAt: "2026-10-27T13:00:00Z", version: 1 },
  ],
});

export const previewUpcoming: MeetingPage<Meeting> = { items: [graphMeeting, invitedMeeting, linkedMeeting], page: 0, size: 20, total: 3 };
export const previewPast: MeetingPage<Meeting> = { items: [historicalMeeting], page: 0, size: 20, total: 1 };
export const previewCancelled: MeetingPage<Meeting> = { items: [cancelledMeeting], page: 0, size: 20, total: 1 };
export const previewNotifications: MeetingPage<MeetingNotification> = { items: [
  { id: "87000000-0000-4000-8000-000000000020", meetingId: invitedMeeting.id, type: "CONVITE_RECEBIDO", title: invitedMeeting.title, startsAt: invitedMeeting.startsAt, createdAt: "2026-11-02T12:10:00Z", readAt: null },
  { id: "87000000-0000-4000-8000-000000000021", meetingId: linkedMeeting.id, type: "REUNIAO_ALTERADA", title: linkedMeeting.title, startsAt: linkedMeeting.startsAt, createdAt: "2026-11-02T11:00:00Z", readAt: null },
], page: 0, size: 20, total: 2 };

export const previewCandidates: MeetingCandidate[] = [
  { id: inviteeId, name: "Ana Costa" },
  { id: "87000000-0000-4000-8000-000000000005", name: "Ana Paula Santos" },
  { id: thirdMemberId, name: "Caio Mendes" },
  { id: "87000000-0000-4000-8000-000000000006", name: "João Lima" },
];
