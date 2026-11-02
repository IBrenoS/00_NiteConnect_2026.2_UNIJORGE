import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { previewAgendaEvents, previewFrequencyHistory, previewFrequencyList, previewFrequencyLists, previewFrequencyParticipants, previewFrequencySummary } from "../../lib/frequency/preview-fixtures";
import type { HistoryEntry, ParticipantPage } from "../../lib/frequency/contracts";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
vi.mock("./qr-scanner", () => ({ QrScanner: () => null }));
vi.mock("../../lib/frequency/actions", () => ({
  cancelFrequencyList: vi.fn(),
  changeFrequencyParticipant: vi.fn(),
  finalizeFrequencyList: vi.fn(),
  openFrequencyList: vi.fn(),
  renewFrequencyListQr: vi.fn(),
}));

import { FrequencyWorkspace } from "./frequency-workspace";

const canceledEntry: HistoryEntry = {
  ...previewFrequencyHistory.items[0]!,
  listId: "93000000-0000-4000-8000-000000000109",
  meetingName: "Reunião cancelada",
  status: "FORA_DA_APURACAO",
  attendanceStatus: "AGUARDANDO",
  confirmedAt: null,
  changedAt: null,
  presenceRecorded: false,
  listStatus: "CANCELADA",
  outcome: "NAO_REALIZADA",
  inApuration: false,
  accountingStatus: "CANCELADA",
  notCountedReason: "REUNIAO_CANCELADA",
};

function props(overrides: Partial<Parameters<typeof FrequencyWorkspace>[0]> = {}): Parameters<typeof FrequencyWorkspace>[0] {
  return {
    manager: true,
    view: "personal",
    mode: "meeting",
    groupBy: "MONTH",
    rangeKey: "MONTH:2026-11",
    openKey: "83000000-0000-4000-8000-000000000901",
    from: "2026-11-01",
    to: "2026-11-30",
    historyPage: { ...previewFrequencyHistory, items: [...previewFrequencyHistory.items, canceledEntry] },
    historyIssue: null,
    personalSummary: previewFrequencySummary,
    summaryIssue: null,
    openLists: [],
    openListsIssue: null,
    selectedHistoryPage: 0,
    lists: previewFrequencyLists,
    listIssue: null,
    selectedList: null,
    participants: previewFrequencyParticipants,
    participantsIssue: null,
    participantPage: 0,
    participantStatus: "",
    participantSearch: "",
    listStatus: "",
    events: [],
    eventsIssue: null,
    collective: null,
    collectiveIssue: null,
    collectivePage: 0,
    memberSearch: "",
    selectedMemberId: "",
    memberHistory: null,
    memberHistoryIssue: null,
    memberHistoryPage: 0,
    notice: "",
    error: "",
    synthetic: true,
    ...overrides,
  };
}

describe("apresentação da Frequência", () => {
  it("alinha todos os estados do histórico em uma coluna estável e usa as cores semânticas", () => {
    const html = renderToStaticMarkup(<FrequencyWorkspace {...props()} />);

    expect(html.match(/sm:grid-cols-\[minmax\(0,1fr\)_minmax\(8rem,10rem\)_minmax\(12rem,13rem\)\][^"]*lg:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,1fr\)\]/g)).toHaveLength(6);
    expect(html.match(/lg:justify-self-center/g)).toHaveLength(6);
    expect(html).toMatch(/text-status-done[^\"]*">Presente/);
    expect(html).toMatch(/text-status-warning[^\"]*">Justificado/);
    expect(html).toMatch(/text-status-error[^\"]*">Ausente/);
    expect(html).toMatch(/text-nite-text-secondary[^\"]*">Cancelada<\/span>/);
  });

  it("remove o aviso redundante e reduz a largura do vínculo com a Agenda", () => {
    const html = renderToStaticMarkup(<FrequencyWorkspace {...props({
      view: "management",
      syntheticOpenCreate: true,
      selectedList: previewFrequencyList,
    })} />);

    expect(html).toContain('>Criar sem vínculo</option>');
    expect(html).not.toContain("Nenhum encontro agendado para hoje.");
    expect(html).not.toContain("A lista pode ser criada sem vínculo.");
    expect(html).toContain("xl:grid-cols-[minmax(9rem,.6fr)_minmax(15rem,1.15fr)_minmax(13rem,.9fr)_minmax(12rem,.9fr)]");
  });

  it("renderiza as duas escolhas de frequência para uma reunião direta excepcional", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T15:00:00.000Z"));
    try {
      const html = renderToStaticMarkup(<FrequencyWorkspace {...props({
        view: "management",
        syntheticOpenCreate: true,
        selectedList: previewFrequencyList,
      })} />);

      expect(html).toContain('name="countsForFrequency"');
      expect(html).toContain('value="true" selected="">Sim, se realizada</option>');
      expect(html).toContain('value="false">Não</option>');
    } finally {
      vi.useRealTimers();
    }
  });

  it("mostra falha de Agenda separada da ausência de eventos", () => {
    const html = renderToStaticMarkup(<FrequencyWorkspace {...props({
      view: "management",
      syntheticOpenCreate: true,
      selectedList: previewFrequencyList,
      eventsIssue: "unavailable",
    })} />);

    expect(html).toContain("Não foi possível carregar a Agenda.");
    expect(html).not.toContain("A lista pode ser criada sem vínculo.");
  });

  it("lista encontros elegíveis quando existem na Agenda", () => {
    const html = renderToStaticMarkup(<FrequencyWorkspace {...props({
      view: "management",
      syntheticOpenCreate: true,
      selectedList: previewFrequencyList,
      events: previewAgendaEvents,
    })} />);

    expect(html).toContain("Encontro semanal do NITE · 18:00");
    expect(html).toContain("Reunião de planejamento · 18:15");
    expect(html).not.toContain("Nenhum encontro agendado para hoje.");
    expect(html).not.toContain("A lista pode ser criada sem vínculo.");
  });

  it("identifica a reunião não contabilizada sem sugerir ausência do integrante", () => {
    const outsidePage: ParticipantPage = {
      ...previewFrequencyParticipants,
      items: [{ ...previewFrequencyParticipants.items[0]!, status: "FORA_DA_APURACAO" }],
      total: 1,
      counts: { ...previewFrequencyParticipants.counts, outsideApuration: 1 },
    };
    const html = renderToStaticMarkup(<FrequencyWorkspace {...props({
      view: "management",
      participants: outsidePage,
      selectedList: { ...previewFrequencyList, status: "CANCELADA", outcome: "NAO_REALIZADA", closedAt: "2026-11-02T21:05:00Z" },
    })} />);

    expect(html).toContain("Reunião não contabilizada");
    expect(html).toContain("Integrantes não contabilizados");
    expect(html).not.toContain("Fora da apuração");
    expect(html).not.toContain("Ausente</span>");
  });

  it("mantém a situação principal sem repetir a classificação excepcional", () => {
    const exceptionalCompletedList = { ...previewFrequencyList, classification: "EXCEPTIONAL" as const, status: "CONCLUIDA" as const, outcome: "REALIZADA_CONTABILIZAVEL" as const, closedAt: "2026-11-02T21:05:00Z" };
    const html = renderToStaticMarkup(<FrequencyWorkspace {...props({
      view: "management",
      selectedList: exceptionalCompletedList,
    })} />);

    expect(html).toContain("Concluída");
    expect(html).not.toContain("Excepcional");
  });
});
