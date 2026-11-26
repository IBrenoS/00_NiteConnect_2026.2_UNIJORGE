"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import type { WorkspaceOverview, ProjectTeamMember, MembershipRequest } from "../../lib/projects/integration-contracts";
import type { ProjectCandidate, ProjectDetails } from "../../lib/projects/administration-contracts";
import { projectTransitions } from "../../lib/projects/administration-contracts";
import { changeProjectCoverAction, changeProjectStatusAction, manageProjectMemberAction, transferProjectLeadershipAction, updateProjectAction } from "../../lib/projects/administration-actions";
import { decideProjectMembershipAction, setProjectAvailabilityAction } from "../../lib/projects/actions";
import { projectIssueText, projectStatusLabels } from "../../lib/projects/presentation";
import { Button, buttonClassName } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Avatar, ProjectIssue } from "./project-ui";
import { ProjectDeleteDialog } from "./project-delete-dialog";
import styles from "./project-administration-layout.module.css";

type Issue = string | null;

function projectDetails(workspace: WorkspaceOverview): ProjectDetails {
  return { id: workspace.projectId, title: workspace.name, description: workspace.description, startsOn: workspace.startsOn, endsOn: workspace.endsOn, status: workspace.status, version: workspace.version };
}

export function ProjectEditDialog({ workspace, imageUrl, open, onClose }: { workspace: WorkspaceOverview; imageUrl: string | null; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [startsOn, setStartsOn] = useState(workspace.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(workspace.endsOn ?? "");
  const [version, setVersion] = useState(workspace.version);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [error, setError] = useState<Issue>(null);
  const [notice, setNotice] = useState("");
  const previewUrl = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = projectDetails(workspace);

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setCoverPreview(null);
  }

  function chooseCover(file: File | undefined) {
    setError(null);
    setNotice("");
    clearPreview();
    setCoverFile(null);
    setCoverRemoved(false);
    if (!file) return;
    if (!(file.type === "image/png" || file.type === "image/jpeg") || file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError("Escolha uma imagem PNG ou JPEG de até 2 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrl.current = url;
    setCoverPreview(url);
    setCoverFile(file);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (startsOn && endsOn && startsOn > endsOn) {
      setError("A previsão de término precisa ser igual ou posterior ao início.");
      return;
    }
    setError(null);
    setNotice("");
    startTransition(async () => {
      let nextVersion = version;
      const changed = title !== current.title || description !== current.description || (startsOn || null) !== current.startsOn || (endsOn || null) !== current.endsOn;
      if (changed) {
        const result = await updateProjectAction(workspace.projectId, { title, description, startsOn: startsOn || null, endsOn: endsOn || null, expectedVersion: nextVersion });
        if (result.issue || !result.data) {
          setError(result.issueText ?? projectIssueText(result.issue ?? "unavailable"));
          return;
        }
        nextVersion = result.data.version;
        setVersion(nextVersion);
      }
      if (coverFile || coverRemoved) {
        const result = await changeProjectCoverAction(workspace.projectId, nextVersion, coverRemoved ? null : coverFile);
        if (result.issue || !result.data) {
          setError(result.issueText ?? projectIssueText(result.issue ?? "unavailable"));
          if (changed) setNotice("Os dados cadastrais foram salvos, mas a capa não foi atualizada.");
          router.refresh();
          return;
        }
        nextVersion = result.data.version;
        setVersion(nextVersion);
        setCoverFile(null);
        setCoverRemoved(false);
        clearPreview();
      }
      if (!changed && !coverFile && !coverRemoved) {
        setNotice("Nenhuma alteração foi feita.");
        return;
      }
      setNotice("Alterações salvas.");
      router.refresh();
    });
  }

  const visibleCover = coverPreview ?? (!coverRemoved ? imageUrl : null);
  return <Dialog open={open} onOpenChange={value => { if (!value && !pending) onClose(); }} title="Editar projeto" description="Atualize as informações de apresentação do projeto." className={styles.editDialog} footer={<><Button variant="secondary" type="button" disabled={pending} onClick={onClose}>Cancelar</Button><Button type="submit" form="project-edit-real-form" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</Button></>}>
    <form id="project-edit-real-form" className={styles.editForm} onSubmit={save}>
      <div className={styles.coverEditor}>
        <div className={styles.coverPreview}>{visibleCover ? <Image src={visibleCover} alt={`Capa de ${workspace.name}`} width={400} height={250} unoptimized/> : <div className={styles.coverMini}><span>CAPA DO PROJETO</span><strong>{workspace.name}</strong></div>}</div>
        <div className={styles.coverCopy}><strong>Imagem de capa</strong><p>PNG ou JPEG · até 2 MB · 4096 × 4096 px</p><label className={buttonClassName({ variant: "secondary", size: "compact" })}>{imageUrl || coverFile ? "Substituir imagem" : "Escolher imagem"}<input type="file" accept="image/png,image/jpeg" aria-label="Imagem de capa" disabled={pending} onChange={event => { chooseCover(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/></label>{imageUrl && !coverRemoved && !coverFile ? <button type="button" className={styles.textButton} disabled={pending} onClick={() => { clearPreview(); setCoverRemoved(true); setNotice(""); }}>Remover imagem</button> : null}{coverRemoved ? <button type="button" className={styles.textButton} disabled={pending} onClick={() => setCoverRemoved(false)}>Manter imagem atual</button> : null}</div>
      </div>
      <label className={styles.field}>Nome do projeto<input name="title" required maxLength={200} value={title} disabled={pending} onChange={event => setTitle(event.target.value)}/></label>
      <label className={styles.field}>Descrição<textarea name="description" required maxLength={10000} rows={4} value={description} disabled={pending} onChange={event => setDescription(event.target.value)}/><small>Apresente o propósito do projeto em poucas palavras.</small></label>
      <div className={styles.dateFields}><label className={styles.field}>Data de início<input type="date" name="startsOn" value={startsOn} disabled={pending} onChange={event => setStartsOn(event.target.value)}/></label><label className={styles.field}>Previsão de término<input type="date" name="endsOn" value={endsOn} disabled={pending} onChange={event => setEndsOn(event.target.value)}/></label></div>
      {error ? <p role="alert" className={styles.formFeedback}>{error}</p> : null}{notice ? <p role="status" className={styles.successMessage}>{notice}</p> : null}
    </form>
  </Dialog>;
}

export function ProjectTeamAdministration({ workspace, members, requests, candidates = [], candidateSearch = "", membersIssue = null, requestsIssue = null, candidatesIssue = null }: {
  workspace: WorkspaceOverview; members: ProjectTeamMember[]; requests: MembershipRequest[]; candidates?: ProjectCandidate[]; candidateSearch?: string; membersIssue?: Issue; requestsIssue?: Issue; candidatesIssue?: Issue;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<"members" | "requests">("members");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [menuMember, setMenuMember] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const [candidateQuery, setCandidateQuery] = useState(candidateSearch);
  const [responsibility, setResponsibility] = useState("");
  const [ending, setEnding] = useState<ProjectTeamMember | null>(null);
  const [leaderTarget, setLeaderTarget] = useState<ProjectTeamMember | null | "vacant">(null);
  const [decision, setDecision] = useState<{ request: MembershipRequest; approve: boolean } | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [error, setError] = useState<Issue>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const canManage = workspace.capabilities.canManageMembers;
  const canDecide = workspace.capabilities.canDecideRequests;
  const canLead = workspace.capabilities.canTransferLeadership;
  const visibleMembers = useMemo(() => members.filter(person => `${person.memberName ?? ""} ${person.responsibility}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [members, search]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleMembers.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shownMembers = visibleMembers.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const pendingRequests = requests.filter(request => request.state === "PENDENTE");

  function submitCandidateSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get("integrante");
    const value = typeof query === "string" ? query.trim() : "";
    if (value.length < 2 || value.length > 160) return;
    setCandidateQuery(value);
    router.push(`${pathname}?integrante=${encodeURIComponent(value)}`);
  }

  function addMember() {
    if (pending || !canManage || !candidateId || !responsibility.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await manageProjectMemberAction(workspace.projectId, { operation: "join", memberId: candidateId, responsibility, expectedVersion: workspace.version });
      if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; }
      setNotice("Integrante adicionado à equipe.");
      setAdding(false);
      setCandidateId("");
      setResponsibility("");
      router.refresh();
    });
  }

  function endMember() {
    if (!ending || pending || !canManage) return;
    setError(null);
    startTransition(async () => {
      const result = await manageProjectMemberAction(workspace.projectId, { operation: "end", memberId: ending.memberId, expectedVersion: workspace.version });
      if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; }
      setNotice("Participação encerrada.");
      setEnding(null);
      router.refresh();
    });
  }

  function changeLeadership() {
    if (leaderTarget === null || pending || !canLead) return;
    const memberId = leaderTarget === "vacant" ? null : leaderTarget.memberId;
    setError(null);
    startTransition(async () => {
      const result = await transferProjectLeadershipAction(workspace.projectId, { memberId, expectedVersion: workspace.version });
      if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; }
      setNotice(memberId ? "Gestor do projeto atualizado." : "Liderança do projeto liberada.");
      setLeaderTarget(null);
      setMenuMember(null);
      router.refresh();
    });
  }

  function decideRequest() {
    if (!decision || pending || !canDecide) return;
    setError(null);
    startTransition(async () => {
      const result = await decideProjectMembershipAction(workspace.projectId, decision.request.id, { approve: decision.approve, message: responseMessage, expectedVersion: decision.request.version });
      if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; }
      setNotice(decision.approve ? "Solicitação aprovada." : "Solicitação rejeitada.");
      setDecision(null);
      setResponseMessage("");
      router.refresh();
    });
  }

  return <>
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}>EQUIPE · {workspace.name.toLocaleUpperCase("pt-BR")}</span><h1>Equipe do projeto</h1><p>Integrantes, responsabilidades e solicitações de ingresso.</p></div>{canManage ? <Button leadingIcon={<span aria-hidden="true">＋</span>} onClick={() => { setAdding(value => !value); setError(null); }}>{adding ? "Fechar" : "Adicionar integrante"}</Button> : null}</header>
    <nav className={styles.tabs} role="tablist" aria-label="Seções da equipe"><button id="project-members-tab" type="button" role="tab" aria-controls="project-members-panel" aria-selected={tab === "members"} onClick={() => setTab("members")}>Integrantes <span>{members.length}</span></button>{canDecide ? <button id="project-requests-tab" type="button" role="tab" aria-controls="project-requests-panel" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>Solicitações <span>{pendingRequests.length}</span></button> : null}</nav>
    {adding && canManage ? <section className={styles.addMemberForm} aria-label="Adicionar integrante"><div><form onSubmit={submitCandidateSearch}><label className={styles.field}>Pesquisar integrantes ativos<input name="integrante" minLength={2} maxLength={160} value={candidateQuery} placeholder="Digite pelo menos 2 caracteres" onChange={event => setCandidateQuery(event.target.value)}/></label><Button variant="secondary" size="compact" disabled={pending}>Pesquisar</Button></form>{candidateSearch ? candidatesIssue ? <ProjectIssue issue={candidatesIssue}/> : candidates.length ? <label className={styles.field}>Integrante<select value={candidateId} onChange={event => setCandidateId(event.target.value)}><option value="">Selecione uma pessoa</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label> : <p className={styles.emptyState}>Nenhum integrante ativo encontrado.</p> : <p className={styles.permissionNote}>Pesquise pessoas ativas para adicionar à equipe.</p>}<label className={styles.field}>Responsabilidade no projeto<input value={responsibility} maxLength={200} onChange={event => setResponsibility(event.target.value)} placeholder="Descreva a responsabilidade"/></label></div><div className={styles.addActions}><Button variant="secondary" type="button" disabled={pending} onClick={() => { setAdding(false); setError(null); }}>Cancelar</Button><Button type="button" disabled={pending || !candidateSearch || !candidateId || !responsibility.trim()} onClick={addMember}>{pending ? "Salvando…" : "Adicionar à equipe"}</Button></div>{error ? <p role="alert" className={styles.formFeedback}>{error}</p> : null}</section> : null}
    {tab === "members" ? <section id="project-members-panel" className={styles.teamContent} role="tabpanel" aria-labelledby="project-members-tab"><div className={styles.tableToolbar}><label className={styles.searchField}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar integrantes" placeholder="Buscar por nome ou responsabilidade" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/>{search ? <button type="button" aria-label="Limpar pesquisa" onClick={() => { setSearch(""); setPage(0); }}>×</button> : null}</label><span>{visibleMembers.length} {visibleMembers.length === 1 ? "integrante" : "integrantes"}</span></div>
      {membersIssue ? <ProjectIssue issue={membersIssue}/> : shownMembers.length ? <><div className={styles.tableScroll}><table className={styles.memberTable}><thead><tr><th scope="col">Integrante</th><th scope="col">Responsabilidade</th><th scope="col">Liderança do projeto</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead><tbody>{shownMembers.map(person => { const isLeader = person.memberId === workspace.leaderId; return <tr key={person.id}><td><div className={styles.memberIdentity}><Avatar name={person.memberName ?? "Integrante indisponível"} memberId={person.memberId}/><span><strong>{person.memberName ?? "Integrante indisponível"}</strong></span></div></td><td>{person.responsibility}</td><td>{isLeader ? <small className={styles.leadMarker}>Gestor do projeto</small> : <span className={styles.mutedCell}>—</span>}</td><td>{canManage || canLead ? <div className={styles.rowMenuWrap}><button type="button" className={styles.rowMenuTrigger} aria-label={`Ações para ${person.memberName ?? "integrante"}`} aria-expanded={menuMember === person.id} onClick={() => { setError(null); setMenuMember(menuMember === person.id ? null : person.id); }}>···</button>{menuMember === person.id ? <div className={styles.rowMenu} role="menu">{canLead ? <><button type="button" role="menuitem" onClick={() => setLeaderTarget(person)} disabled={isLeader}>{isLeader ? "Gestor atual do projeto" : "Designar gestor do projeto"}</button>{isLeader ? <button type="button" role="menuitem" onClick={() => setLeaderTarget("vacant")}>Liberar liderança do projeto</button> : null}</> : null}{canManage ? <button type="button" role="menuitem" className={styles.dangerMenuItem} onClick={() => { setEnding(person); setMenuMember(null); }}>Encerrar participação</button> : null}</div> : null}</div> : null}</td></tr>; })}</tbody></table></div><p className={styles.mobileTableHint}>Deslize a tabela para consultar as demais colunas.</p>{visibleMembers.length > pageSize ? <nav className={styles.pagination} aria-label="Paginação de integrantes"><span>Exibindo {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, visibleMembers.length)} de {visibleMembers.length}</span><div><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button></div></nav> : null}</> : <div className={styles.emptyState}><strong>{search ? "Nenhum integrante encontrado" : "A equipe ainda está vazia"}</strong><p>{search ? "Tente outra pesquisa por nome ou responsabilidade." : "Os integrantes com participação vigente aparecerão aqui."}</p>{!search && canManage ? <Button variant="secondary" onClick={() => setAdding(true)}>Adicionar primeiro integrante</Button> : null}</div>}
    </section> : <section id="project-requests-panel" className={styles.requestContent} role="tabpanel" aria-labelledby="project-requests-tab"><div className={styles.requestIntro}><div><h2>Solicitações para participar</h2><p>Pedidos pendentes de ingresso neste projeto.</p></div><span>{pendingRequests.length}</span></div>{requestsIssue ? <ProjectIssue issue={requestsIssue}/> : pendingRequests.length ? pendingRequests.map(request => <article className={styles.requestRow} key={request.id}><Avatar name={request.memberName ?? "Integrante"} memberId={request.memberId}/><div><strong>{request.memberName ?? "Integrante indisponível"}</strong><small>{request.message || "Sem mensagem adicional."}</small><span>Enviada em {new Date(request.requestedAt).toLocaleDateString("pt-BR")}</span></div><div className={styles.requestActions}><button className={styles.requestAccept} type="button" disabled={pending} onClick={() => { setDecision({ request, approve: true }); setResponseMessage(""); setError(null); }}>Aprovar</button><button className={styles.requestDecline} type="button" disabled={pending} onClick={() => { setDecision({ request, approve: false }); setResponseMessage(""); setError(null); }}>Rejeitar</button></div></article>) : <div className={styles.emptyState}><strong>Nenhuma solicitação pendente</strong><p>Novos pedidos aparecerão aqui quando forem enviados.</p></div>}</section>}
    {notice ? <p className={styles.settingsNotice} role="status">{notice}</p> : null}
    <p className={styles.previewDisclosure}>Liderança do projeto e papel institucional são informações distintas.</p>
    <Dialog open={ending !== null} onOpenChange={value => { if (!value && !pending) { setEnding(null); setError(null); } }} title="Encerrar participação?" description={ending?.memberName ?? undefined} footer={<><Button variant="secondary" type="button" disabled={pending} onClick={() => setEnding(null)}>Cancelar</Button><Button variant="destructive" type="button" disabled={pending} onClick={endMember}>{pending ? "Encerrando…" : "Encerrar participação"}</Button></>}><p>A participação vigente será encerrada. A liderança do projeto precisa ser transferida antes de encerrar a participação do gestor atual.</p>{error ? <p role="alert">{error}</p> : null}</Dialog>
    <Dialog open={leaderTarget !== null} onOpenChange={value => { if (!value && !pending) { setLeaderTarget(null); setError(null); } }} title={leaderTarget === "vacant" ? "Liberar liderança?" : "Designar gestor do projeto?"} description={leaderTarget && leaderTarget !== "vacant" ? leaderTarget.memberName ?? undefined : workspace.name} footer={<><Button variant="secondary" type="button" disabled={pending} onClick={() => setLeaderTarget(null)}>Cancelar</Button><Button type="button" disabled={pending} onClick={changeLeadership}>{pending ? "Salvando…" : "Confirmar"}</Button></>}>{leaderTarget === "vacant" ? <p>O projeto ficará sem liderança contextual até uma nova designação.</p> : <p>A pessoa precisa atender aos critérios institucionais e ter participação vigente. A API valida a elegibilidade antes de alterar a liderança.</p>}{error ? <p role="alert">{error}</p> : null}</Dialog>
    <Dialog open={decision !== null} onOpenChange={value => { if (!value && !pending) { setDecision(null); setError(null); } }} title={decision?.approve ? "Aprovar solicitação" : "Rejeitar solicitação"} description={decision?.request.memberName ?? undefined} footer={<><Button variant="secondary" type="button" disabled={pending} onClick={() => setDecision(null)}>Cancelar</Button><Button type="button" disabled={pending} onClick={decideRequest}>{pending ? "Salvando…" : "Confirmar decisão"}</Button></>}><p>{decision?.approve ? "A aprovação cria uma participação vigente na equipe." : "A rejeição encerra este pedido sem criar participação."}</p><label className={styles.field}>Resposta opcional<textarea maxLength={2000} rows={4} value={responseMessage} disabled={pending} onChange={event => setResponseMessage(event.target.value)}/></label>{error ? <p role="alert">{error}</p> : null}</Dialog>
  </>;
}

export function ProjectSettingsAdministration({ workspace, canChangeStatus }: { workspace: WorkspaceOverview; canChangeStatus: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<Issue>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const transitions = projectTransitions[workspace.status];
  const canSetAvailability = workspace.capabilities.canManageAvailability;

  function setStatus(status: WorkspaceOverview["status"]) {
    if (pending || !canChangeStatus || !transitions.includes(status)) return;
    setError(null); setNotice("");
    startTransition(async () => {
      const result = await changeProjectStatusAction(workspace.projectId, { status, expectedVersion: workspace.version });
      if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; }
      setNotice("Situação do projeto atualizada.");
      router.refresh();
    });
  }

  function toggleAvailability(acceptingMembers: boolean) {
    if (pending || !canSetAvailability || workspace.status === "CONCLUIDO") return;
    setError(null); setNotice("");
    startTransition(async () => {
      const result = await setProjectAvailabilityAction(workspace.projectId, { acceptingMembers, expectedVersion: workspace.version });
      if (result.issue) { setError(result.issueText ?? projectIssueText(result.issue)); return; }
      setNotice("Disponibilidade de ingresso atualizada.");
      router.refresh();
    });
  }

  return <>
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}>PROJETO · {workspace.name.toLocaleUpperCase("pt-BR")}</span><h1>Configurações do projeto</h1><p>Situação, ingresso, documentos e exclusão do projeto.</p></div></header>
    <div className={styles.settingsLayout}>
      <section className={styles.settingsSection} aria-labelledby="project-status-heading"><div className={styles.settingsLead}><h2 id="project-status-heading">Situação</h2><p>Situação atual e próximas transições permitidas.</p></div><div className={styles.settingsRows}><div className={styles.settingsRow}><div><strong>Situação atual</strong><small>{projectStatusLabels[workspace.status]}</small></div><span className={`${styles.statusPill} ${styles[`status_${workspace.status}`]}`}><i/>{projectStatusLabels[workspace.status]}</span></div><div className={styles.settingsRow}><div><strong>Transições disponíveis</strong><small>As opções disponíveis seguem as regras de situação do projeto.</small></div>{canChangeStatus && transitions.length ? <div className={styles.transitionActions}>{transitions.map(status => <button key={status} type="button" className={styles.textAction} disabled={pending} onClick={() => setStatus(status)}>{({ PLANEJAMENTO: "Planejar", ATIVO: "Ativar", PAUSADO: "Pausar", CONCLUIDO: "Concluir" })[status]} <span aria-hidden="true">→</span></button>)}</div> : <span className={styles.readOnlyValue}>{canChangeStatus ? "Sem transições disponíveis" : "Sem permissão para alterar situação"}</span>}</div></div></section>
      <section className={styles.settingsSection} aria-labelledby="project-availability-heading"><div className={styles.settingsLead}><h2 id="project-availability-heading">Ingresso</h2><p>Controle se novas solicitações de participação podem ser enviadas.</p></div><div className={styles.settingsRows}><div className={styles.settingsRow}><div><strong>Receber solicitações de participação</strong><small>{workspace.status === "CONCLUIDO" ? "Projetos concluídos não recebem novos pedidos." : "Interessados podem solicitar participação na equipe."}</small></div>{canSetAvailability ? <label className={styles.switchControl}><span>{workspace.acceptingMembers && workspace.status !== "CONCLUIDO" ? "Ativado" : "Desativado"}</span><input type="checkbox" role="switch" aria-label="Receber solicitações de participação" checked={workspace.acceptingMembers && workspace.status !== "CONCLUIDO"} disabled={pending || workspace.status === "CONCLUIDO"} onChange={event => toggleAvailability(event.target.checked)}/><i/></label> : <span className={styles.readOnlyValue}>{workspace.acceptingMembers && workspace.status !== "CONCLUIDO" ? "Ativado" : "Desativado"}</span>}</div></div></section>
      {workspace.capabilities.canViewDocuments && workspace.capabilities.canManageMembers ? <section className={styles.settingsSection} aria-labelledby="project-documents-heading"><div className={styles.settingsLead}><h2 id="project-documents-heading">Documentos</h2><p>Solicitações de exclusão documental vinculadas ao projeto.</p></div><div className={styles.settingsRows}><div className={styles.settingsRow}><div><strong>Solicitações de exclusão</strong><small>Consulte os pedidos documentais disponíveis para análise.</small></div><a className={styles.textAction} href={`/projetos/${workspace.projectId}/documentos/aprovacoes`}>Ver solicitações <span aria-hidden="true">→</span></a></div></div></section> : null}
      {workspace.capabilities.canDeleteProject ? <section className={styles.dangerZone} aria-labelledby="project-danger-heading"><div><h2 id="project-danger-heading">Zona de risco</h2><p>Excluir o projeto remove sua apresentação das áreas ativas e segue as regras de retenção documental.</p></div><Button variant="destructive" onClick={() => setDeleteOpen(true)}>Excluir projeto</Button></section> : null}
      {error ? <p className={styles.settingsNotice} role="alert">{error}</p> : notice ? <p className={styles.settingsNotice} role="status">{notice}</p> : null}
    </div>
    <ProjectDeleteDialog projectId={workspace.projectId} name={workspace.name} open={deleteOpen} onOpenChange={setDeleteOpen}/>
  </>;
}
