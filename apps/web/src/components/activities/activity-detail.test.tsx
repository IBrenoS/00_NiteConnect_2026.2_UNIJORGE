import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { previewActivities, previewAssignees, previewEvidence, previewHistory, previewProjectTitles } from "../../lib/activities/preview-fixtures";
import { requiresTransitionConfirmation } from "./activity-action-dialog";

vi.mock("../../lib/activities/actions", () => ({
  addActivityCollaboratorAction: vi.fn(),
  addActivityEvidenceAction: vi.fn(),
  changeActivityExecutorAction: vi.fn(),
  deleteActivityAction: vi.fn(),
  removeActivityCollaboratorAction: vi.fn(),
  transitionActivityAction: vi.fn(),
  updateActivityAction: vi.fn(),
  uploadActivityEvidenceAction: vi.fn(),
  withdrawActivityEvidenceAction: vi.fn(),
}));

import { ActivityDetail } from "./activity-detail";

const activity = previewActivities[0];
const evidence = { items: [...previewEvidence], page: 0, size: 20, total: previewEvidence.length };
const assignees = { items: [...previewAssignees], page: 0, size: 20, total: previewAssignees.length };
const history = { items: [...previewHistory], page: 0, size: 20, total: previewHistory.length };

const authorizedProps: Parameters<typeof ActivityDetail>[0] = {
  activity,
  projectTitle: previewProjectTitles[activity.projectId ?? ""] ?? null,
  memberId: activity.primaryExecutorId,
  returnTo: "/atividades?q=orienta&status=EM_EXECUCAO",
  capabilities: { edit: true, changePriority: true, canDelete: true, transitions: ["CANCELADA", "CONCLUIDA"], history: true, manageAssignees: true, addEvidence: true, upload: true },
  assignees,
  assigneeIssue: null,
  candidates: { items: [{ id: "83000000-0000-4000-8000-000000000003", name: "Outro integrante" }], page: 0, size: 20, total: 1 },
  candidateIssue: null,
  candidateQuery: "",
  candidatePage: 0,
  candidateSearchInvalid: false,
  participantsOpen: false,
  evidence,
  evidenceIssue: null,
  evidenceWithdraw: Object.fromEntries(previewEvidence.map((item) => [item.id, true])),
  history,
  historyIssue: null,
  historyAllowed: true,
  evidencePage: 0,
  historyPage: 0,
};

describe("detalhe pessoal de atividade", () => {
  it("exige confirmação somente para cancelar ou reabrir uma situação terminal", () => {
    expect(requiresTransitionConfirmation("EM_EXECUCAO", "CONCLUIDA")).toBe(false);
    expect(requiresTransitionConfirmation("PLANEJADA", "EM_EXECUCAO")).toBe(false);
    expect(requiresTransitionConfirmation("EM_EXECUCAO", "CANCELADA")).toBe(true);
    expect(requiresTransitionConfirmation("CONCLUIDA", "EM_EXECUCAO")).toBe(true);
    expect(requiresTransitionConfirmation("CANCELADA", "")).toBe(false);
  });

  it("apresenta descrição, evidências e histórico, com confirmações nas ações críticas", () => {
    const markup = renderToStaticMarkup(<ActivityDetail {...authorizedProps} participantsOpen />);

    expect(markup).toContain("Descrição");
    expect(markup).toContain("Evidências");
    expect(markup).toContain("Histórico");
    expect(markup).toContain("Em atraso");
    expect(markup).toContain("Ações");
    expect(markup).not.toContain("Ações autorizadas");
    expect(markup).toContain("aria-haspopup=\"dialog\"");
    expect(markup).toContain("Adicionar evidência");
    expect(markup).not.toContain('type="url"');
    expect(markup).toContain("Confirmo a troca do executor.");
    expect(markup).toContain("Confirmo o encerramento da participação.");
    expect(markup).toContain("Confirmo a retirada desta evidência.");
    expect(markup).not.toContain("Confirmo o cancelamento da atividade.");
    expect(markup.match(/name="confirmed"/g)).toHaveLength(5);
  });

  it("pré-carrega as datas vigentes e inclui propriedades e expectedVersion na edição", () => {
    const markup = renderToStaticMarkup(<ActivityDetail {...authorizedProps} />);

    expect(markup).toMatch(new RegExp(`name="dueOn"[^>]*value="${activity.dueOn ?? ""}"`));
    expect(markup).toContain(`name="expectedVersion" value="${activity.version}"`);
    expect(markup).toContain('name="startOn"');
    expect(markup).toContain('name="priority"');
    expect(markup).toContain("Motivo");
  });

  it("distingue busca vazia, bloqueio de acesso e falha de carregamento dos candidatos", () => {
    const prompt = renderToStaticMarkup(<ActivityDetail {...authorizedProps} participantsOpen candidates={null} candidateIssue={null} />);
    const empty = renderToStaticMarkup(<ActivityDetail {...authorizedProps} participantsOpen candidates={{ items: [], page: 0, size: 20, total: 0 }} />);
    const noMatches = renderToStaticMarkup(<ActivityDetail {...authorizedProps} participantsOpen candidateQuery="zz" candidates={{ items: [], page: 0, size: 20, total: 0 }} />);
    const forbidden = renderToStaticMarkup(<ActivityDetail {...authorizedProps} participantsOpen candidates={null} candidateIssue="access" />);
    const unavailable = renderToStaticMarkup(<ActivityDetail {...authorizedProps} participantsOpen candidates={null} candidateIssue="unavailable" />);

    expect(prompt).toContain("Digite ao menos dois caracteres para buscar integrantes elegíveis.");
    expect(prompt).toContain('name="candidateQ"');
    expect(prompt).toContain("required");
    const candidateSearchClass = prompt.match(/<form action="\/atividades\/[^\"]+" method="get" class="([^\"]*)">[\s\S]*?name="candidateQ"/)?.[1] ?? "";
    expect(candidateSearchClass).not.toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(empty).toContain("Nenhum integrante elegível disponível");
    expect(empty).not.toContain("Não foi possível carregar participantes");
    expect(noMatches).toContain("Nenhum integrante elegível encontrado.");
    expect(forbidden).toContain("Esta consulta de participantes não está autorizada");
    expect(unavailable).toContain("Não foi possível consultar integrantes elegíveis");
  });

  it("preserva pesquisa de participantes e páginas ao navegar pelos candidatos", () => {
    const markup = renderToStaticMarkup(<ActivityDetail
      {...authorizedProps}
      candidates={{ items: [{ id: "83000000-0000-4000-8000-000000000004", name: "Ana Lima" }], page: 0, size: 1, total: 2 }}
      candidateQuery="Ana"
      candidatePage={0}
      evidencePage={1}
      historyPage={1}
    />);

    expect(markup).toContain('name="candidateQ"');
    expect(markup).toContain("Ana Lima");
    expect(markup).toContain('aria-label="Paginação de integrantes"');
    expect(markup).toContain("candidateQ=Ana");
    expect(markup).toContain("candidatePage=1");
    expect(markup).toContain("participants=1");
    expect(markup).toContain("evidencePage=1");
    expect(markup).toContain("historyPage=1");
  });

  it("carrega candidatos somente ao solicitar o painel e preserva a navegação", () => {
    const markup = renderToStaticMarkup(<ActivityDetail
      {...authorizedProps}
      candidates={null}
      candidateIssue={null}
      evidencePage={1}
      historyPage={1}
    />);

    expect(markup).toContain(`href="/atividades/${activity.id}?`);
    expect(markup).toContain("participants=1");
    expect(markup).toContain("evidencePage=1");
    expect(markup).toContain("historyPage=1");
  });

  it("não expõe ações quando as capacidades foram negadas", () => {
    const markup = renderToStaticMarkup(<ActivityDetail {...authorizedProps} capabilities={{ edit: false, changePriority: false, canDelete: false, transitions: [], history: false, manageAssignees: false, addEvidence: false, upload: false }} evidenceWithdraw={{}} historyAllowed={false} />);

    expect(markup).not.toContain("Ações");
    expect(markup).not.toContain("Alterar situação");
    expect(markup).not.toContain("Gerenciar participantes");
    expect(markup).not.toContain("name=\"confirmed\"");
    expect(markup).toContain("Descrição");
  });
});
