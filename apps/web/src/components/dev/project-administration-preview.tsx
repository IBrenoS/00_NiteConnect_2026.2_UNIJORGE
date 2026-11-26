"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, buttonClassName } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { projectTransitions } from "../../lib/projects/administration-contracts";
import type { ProjectStatus } from "../../lib/projects/integration-contracts";
import { usePreviewScenario } from "./project-administration-preview-shell";
import type { PreviewScenario } from "./project-administration-preview-shell";
import styles from "../projects/project-administration-layout.module.css";

type Context = "presentation" | "edit" | "team" | "settings";
type InstitutionalRole = "GESTOR_GERAL" | "GESTOR_PROJETO" | "COORDENADOR" | null;
type Person = { initials: string; name: string; email: string; area: string; responsibility: string; institutionalRole: InstitutionalRole; color: string };
type Request = { initials: string; name: string; email: string; area: string; date: string };
type Capability = "canEditProject" | "canManageMembers" | "canDecideRequests" | "canTransferLeadership" | "canManageAvailability" | "canChangeStatus" | "canViewDocuments" | "canDeleteProject";

const capabilities: Record<PreviewScenario, ReadonlySet<Capability>> = {
  manager: new Set(["canEditProject", "canManageMembers", "canDecideRequests", "canTransferLeadership", "canManageAvailability", "canChangeStatus", "canViewDocuments", "canDeleteProject"]),
  member: new Set(),
  empty: new Set(["canEditProject", "canManageMembers", "canDecideRequests", "canTransferLeadership", "canManageAvailability", "canChangeStatus", "canViewDocuments", "canDeleteProject"]),
};

const initialPeople: Person[] = [
  { initials: "ML", name: "Marina Lima", email: "marina.lima@nite.edu.br", area: "Sistemas de Informação", responsibility: "Pesquisa e articulação", institutionalRole: "COORDENADOR", color: "blue" },
  { initials: "RC", name: "Rafael Costa", email: "rafael.costa@nite.edu.br", area: "Engenharia de Software", responsibility: "Desenvolvimento", institutionalRole: "GESTOR_PROJETO", color: "green" },
  { initials: "AS", name: "Ana Souza", email: "ana.souza@nite.edu.br", area: "Design", responsibility: "Pesquisa com usuários", institutionalRole: null, color: "rose" },
  { initials: "JP", name: "João Pedro Alves", email: "joao.alves@nite.edu.br", area: "Ciência da Computação", responsibility: "Desenvolvimento", institutionalRole: null, color: "amber" },
];
const initialRequests: Request[] = [
  { initials: "BL", name: "Beatriz Lopes", email: "beatriz.lopes@nite.edu.br", area: "Sistemas de Informação", date: "há 2 dias" },
  { initials: "TM", name: "Tiago Martins", email: "tiago.martins@nite.edu.br", area: "Engenharia de Software", date: "há 4 dias" },
];
const emptyPeople: Person[] = [];
const statusLabels: Record<ProjectStatus, string> = { PLANEJAMENTO: "Em planejamento", ATIVO: "Em andamento", PAUSADO: "Pausado", CONCLUIDO: "Concluído" };
const statusActionLabels: Record<ProjectStatus, string> = { PLANEJAMENTO: "Planejar", ATIVO: "Ativar", PAUSADO: "Pausar", CONCLUIDO: "Concluir" };
const institutionalLabels: Record<Exclude<InstitutionalRole, null>, string> = { GESTOR_GERAL: "Gestão geral", GESTOR_PROJETO: "Gestão de projeto", COORDENADOR: "Coordenação" };
const contextCopy: Record<Context, { title: string; description: string }> = {
  presentation: { title: "Projeto Aurora", description: "Um espaço colaborativo para transformar ideias em soluções que aproximam tecnologia, educação e comunidade." },
  edit: { title: "Editar projeto", description: "Atualize os dados que identificam e apresentam este projeto." },
  team: { title: "Equipe do projeto", description: "Integrantes, responsabilidades e solicitações de ingresso." },
  settings: { title: "Configurações do projeto", description: "Situação, ingresso, documentos e exclusão do projeto." },
};

function has(scenario: PreviewScenario, capability: Capability) { return capabilities[scenario].has(capability); }

export function ProjectAdministrationPreview({ context }: { context: Context }) {
  const [scenario] = usePreviewScenario();
  const [editOpen, setEditOpen] = useState(context === "edit");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const copy = contextCopy[context];
  return <div className={styles.content}>
    {context !== "presentation" ? <nav className={styles.breadcrumbs} aria-label="Navegação estrutural"><Link href="/dev/project-administration-preview">Projetos</Link><span aria-hidden="true">/</span><Link href="/dev/project-administration-preview">Projeto Aurora</Link><span aria-hidden="true">/</span><span aria-current="page">{copy.title}</span></nav> : null}
    {context === "presentation" ? <ProjectPresentation scenario={scenario} deleted={deleted} onDelete={() => setDeleteOpen(true)} onEdit={() => setEditOpen(true)} /> : null}
    {context === "edit" ? <ProjectEdit scenario={scenario} onClose={() => setEditOpen(false)} /> : null}
    {context === "team" ? <ManageTeam key={scenario} scenario={scenario} /> : null}
    {context === "settings" ? <ProjectSettings scenario={scenario} onDelete={() => setDeleteOpen(true)} /> : null}
    <ProjectEditDialog open={editOpen && context === "presentation"} scenario={scenario} onClose={() => setEditOpen(false)} />
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Excluir projeto?" description="Projeto Aurora deixará de aparecer nas áreas ativas. A exclusão documental seguirá as regras institucionais." footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={!has(scenario, "canDeleteProject")} onClick={() => { setDeleted(true); setDeleteOpen(false); }}>Excluir projeto</Button></>}>
      {!has(scenario, "canDeleteProject") ? <p className={styles.permissionNote}>A exclusão está disponível para pessoas com essa capacidade.</p> : <p className={styles.dialogHint}>Esta ação é demonstrativa e não envia alterações para a API.</p>}
    </Dialog>
  </div>;
}

function ProjectPresentation({ scenario, deleted, onDelete, onEdit }: { scenario: PreviewScenario; deleted: boolean; onDelete: () => void; onEdit: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <div className={styles.presentationTop}><div><span className={styles.eyebrow}>NÚCLEO DE INOVAÇÃO E TECNOLOGIA</span><h1>{deleted ? "Projeto excluído" : "Projeto Aurora"}</h1><p>Pesquisa aplicada · Comunidade acadêmica</p></div>
      {deleted ? null : <div className={styles.contextMenuWrap}><button type="button" className={styles.contextTrigger} aria-label="Ações do projeto" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span aria-hidden="true">···</span></button>{menuOpen ? <div className={styles.contextMenu} role="menu" aria-label="Ações do projeto">
        {has(scenario, "canEditProject") ? <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onEdit(); }}>Editar projeto</button> : null}
        {has(scenario, "canManageMembers") ? <Link role="menuitem" href="/dev/project-administration-preview/equipe" onClick={() => setMenuOpen(false)}>Gerenciar equipe</Link> : null}
        {has(scenario, "canEditProject") || has(scenario, "canManageAvailability") ? <Link role="menuitem" href="/dev/project-administration-preview/configuracoes" onClick={() => setMenuOpen(false)}>Configurações do projeto</Link> : null}
        {has(scenario, "canDeleteProject") ? <><hr/><button role="menuitem" type="button" className={styles.dangerMenuItem} onClick={() => { setMenuOpen(false); onDelete(); }}>Excluir projeto</button></> : null}
        {!has(scenario, "canEditProject") && !has(scenario, "canManageMembers") && !has(scenario, "canManageAvailability") && !has(scenario, "canDeleteProject") ? <span className={styles.menuEmpty}>Sem ações disponíveis</span> : null}
      </div> : null}</div>}
    </div>
    <div className={styles.projectHero} aria-label="Capa do Projeto Aurora"><span className={styles.heroKicker}>NITE CONNECT <i>·</i> PESQUISA E INOVAÇÃO</span><strong>Ideias que movem<br/>o futuro.</strong><span className={styles.heroArtwork} aria-hidden="true" /></div>
    <div className={styles.presentationGrid}><article className={styles.projectDetails}><div className={styles.projectStatusLine}><span className={styles.statusDot} /> Em andamento <span className={styles.detailDivider}>·</span> 4 integrantes <span className={styles.detailDivider}>·</span> Início em 4 ago. 2026</div><section><h2>Sobre o projeto</h2><p>{contextCopy.presentation.description}</p></section><section><h2>O que estamos construindo</h2><p>Prototipagem de experiências digitais para ampliar o acesso a oportunidades de aprendizagem e troca na comunidade.</p></section><section className={styles.projectPeople}><h2>Equipe</h2>{initialPeople.slice(0, 3).map((person) => <span key={person.name} className={`${styles.personAvatar} ${styles[person.color]}`} title={person.name}>{person.initials}</span>)}<span className={styles.teamCount}>+1</span><Link href="/dev/project-administration-preview/equipe">Ver equipe</Link></section><p className={styles.previewDisclosure} role="status">{deleted ? "Este estado faz parte da demonstração." : "Prévia demonstrativa · nenhuma alteração é publicada"}</p></article>
      <aside className={styles.projectAside}><h2>Informações do projeto</h2><dl><div><dt>Liderança do projeto</dt><dd>Rafael Costa</dd></div><div><dt>Área</dt><dd>Inovação e tecnologia</dd></div><div><dt>Data de início</dt><dd>4 de agosto de 2026</dd></div><div><dt>Previsão de término</dt><dd>28 de fevereiro de 2027</dd></div></dl><Link href="/dev/project-administration-preview/equipe">Conhecer a equipe <span aria-hidden="true">→</span></Link></aside></div>
  </>;
}

function ProjectEdit({ scenario, onClose }: { scenario: PreviewScenario; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return <div className={styles.pageHeading}><div><span className={styles.eyebrow}>PROJETO AURORA</span><h1>Editar projeto</h1><p>Atualize os dados que identificam e apresentam este projeto.</p></div><Link href="/dev/project-administration-preview" className={buttonClassName({ variant: "secondary", size: "compact" })}>Voltar ao projeto</Link><ProjectEditDialog open scenario={scenario} onClose={() => { setSaved(false); onClose(); }} saved={saved} setSaved={setSaved}/></div>;
}

function ProjectEditDialog({ open, scenario, onClose, saved, setSaved }: { open: boolean; scenario: PreviewScenario; onClose: () => void; saved?: boolean; setSaved?: (value: boolean) => void }) {
  const canEdit = has(scenario, "canEditProject");
  const [cover, setCover] = useState<string | null>(null);
  const [localSaved, setLocalSaved] = useState(false);
  useEffect(() => () => { if (cover?.startsWith("blob:")) URL.revokeObjectURL(cover); }, [cover]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setLocalSaved(true); setSaved?.(true); };
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }} title="Editar projeto" description="Atualize as informações de apresentação do projeto." className={styles.editDialog} footer={canEdit ? <><Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button><Button type="submit" form="project-edit-form">Salvar alterações</Button></> : <Button variant="secondary" type="button" onClick={onClose}>Fechar</Button>}>
    <form id="project-edit-form" className={styles.editForm} onSubmit={submit}>
      <div className={styles.coverEditor}><div className={styles.coverPreview}>{cover ? <Image src={cover} alt="Prévia da nova capa" width={320} height={200} unoptimized/> : <div className={styles.coverMini}><span>NITE CONNECT</span><strong>Ideias que movem<br/>o futuro.</strong></div>}</div><div className={styles.coverCopy}><strong>Imagem de capa</strong><p>PNG ou JPEG · até 2 MB · 4096 × 4096 px</p><label className={buttonClassName({ variant: "secondary", size: "compact" })}>Escolher imagem<input type="file" accept="image/png,image/jpeg" disabled={!canEdit} aria-label="Imagem de capa" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) setCover(URL.createObjectURL(file)); }}/></label>{cover ? <button className={styles.textButton} type="button" onClick={() => setCover(null)}>Remover imagem</button> : null}</div></div>
      <label className={styles.field}>Nome do projeto<input name="title" defaultValue="Aurora — Laboratório de Inovação" readOnly={!canEdit} required/></label>
      <label className={styles.field}>Descrição<textarea name="description" defaultValue={contextCopy.presentation.description} rows={4} readOnly={!canEdit} required/><small>Apresente o propósito do projeto em poucas palavras.</small></label>
      <div className={styles.dateFields}><label className={styles.field}>Data de início<input type="date" name="startsOn" defaultValue="2026-08-04" readOnly={!canEdit}/></label><label className={styles.field}>Previsão de término<input type="date" name="endsOn" defaultValue="2027-02-28" readOnly={!canEdit}/></label></div>
      {saved || localSaved ? <p role="status" className={styles.successMessage}>Alterações salvas nesta demonstração.</p> : null}
      {!canEdit ? <p className={styles.permissionNote}>A edição está disponível para pessoas com essa capacidade.</p> : null}
    </form>
  </Dialog>;
}

function ManageTeam({ scenario }: { scenario: PreviewScenario }) {
  const empty = scenario === "empty";
  const canManage = has(scenario, "canManageMembers");
  const canDecide = has(scenario, "canDecideRequests");
  const canLead = has(scenario, "canTransferLeadership");
  const [people, setPeople] = useState<Person[]>(empty ? emptyPeople : initialPeople);
  const [requests, setRequests] = useState<Request[]>(empty ? [] : initialRequests);
  const [tab, setTab] = useState<"members" | "requests">("members");
  const [search, setSearch] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<string | null>(null);
  const [leader, setLeader] = useState("Rafael Costa");
  const [notice, setNotice] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [candidate, setCandidate] = useState("LC");
  const pageSize = 3;
  const shownPeople = useMemo(() => people.filter(person => `${person.name} ${person.email} ${person.area}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))), [people, search]);
  const [page, setPage] = useState(0);
  const pagedPeople = shownPeople.slice(page * pageSize, (page + 1) * pageSize);
  const addCandidate = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const next = candidate === "LC" ? { initials: "LC", name: "Lucas Carvalho", email: "lucas.carvalho@nite.edu.br", area: "Sistemas de Informação", responsibility: "A definir", institutionalRole: null as InstitutionalRole, color: "violet" } : { initials: "MP", name: "Mariana Prado", email: "mariana.prado@nite.edu.br", area: "Design", responsibility: "A definir", institutionalRole: null as InstitutionalRole, color: "sand" }; setPeople(current => [...current, next]); setNotice(`${next.name} foi adicionada à equipe nesta demonstração.`); setInviteOpen(false); };
  return <>
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}>PROJETO AURORA</span><h1>{contextCopy.team.title}</h1><p>{contextCopy.team.description}</p></div>{canManage ? <Button leadingIcon={<span aria-hidden="true">＋</span>} onClick={() => setInviteOpen(!inviteOpen)}>{inviteOpen ? "Fechar" : "Adicionar integrante"}</Button> : null}</header>
    <nav className={styles.tabs} role="tablist" aria-label="Seções da equipe"><button id="members-tab" type="button" role="tab" aria-controls="team-members" aria-selected={tab === "members"} onClick={() => setTab("members")}>Integrantes <span>{people.length}</span></button><button id="requests-tab" type="button" role="tab" aria-controls="team-requests" aria-selected={tab === "requests"} onClick={() => setTab("requests")}>Solicitações <span>{canDecide ? requests.length : "—"}</span></button></nav>
    {inviteOpen && canManage ? <form className={styles.addMemberForm} onSubmit={addCandidate}><div><label className={styles.field}>Integrante ativo<select value={candidate} onChange={event => setCandidate(event.target.value)}><option value="LC">Lucas Carvalho · Sistemas de Informação</option><option value="MP">Mariana Prado · Design</option></select></label><label className={styles.field}>Responsabilidade no projeto<input value="A definir" readOnly/></label></div><div className={styles.addActions}><Button variant="secondary" type="button" onClick={() => setInviteOpen(false)}>Cancelar</Button><Button type="submit">Adicionar à equipe</Button></div></form> : null}
    {tab === "members" ? <section id="team-members" className={styles.teamContent} role="tabpanel" aria-labelledby="members-tab"><div className={styles.tableToolbar}><label className={styles.searchField}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar integrantes" placeholder="Buscar por nome, e-mail ou área" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/>{search ? <button type="button" aria-label="Limpar pesquisa" onClick={() => setSearch("")}>×</button> : null}</label><span>{shownPeople.length} {shownPeople.length === 1 ? "integrante" : "integrantes"}</span></div>
      {pagedPeople.length ? <><div className={styles.tableScroll}><table className={styles.memberTable}><thead><tr><th>Integrante</th><th>Responsabilidade</th><th>Papel institucional</th><th><span className={styles.srOnly}>Ações</span></th></tr></thead><tbody>{pagedPeople.map(person => <tr key={person.name}><td><div className={styles.memberIdentity}><span className={`${styles.personAvatar} ${styles[person.color]}`}>{person.initials}</span><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td><td><span>{person.responsibility}</span>{leader === person.name ? <small className={styles.leadMarker}>Gestor do projeto</small> : null}</td><td>{person.institutionalRole ? <span className={styles.institutionalBadge}>{institutionalLabels[person.institutionalRole]}</span> : <span className={styles.mutedCell}>—</span>}</td><td>{canManage || (canLead && person.institutionalRole) ? <div className={styles.rowMenuWrap}><button type="button" className={styles.rowMenuTrigger} aria-label={`Ações para ${person.name}`} aria-expanded={selectedMenu === person.name} onClick={() => setSelectedMenu(selectedMenu === person.name ? null : person.name)}>···</button>{selectedMenu === person.name ? <div className={styles.rowMenu} role="menu">
            {canLead && person.institutionalRole ? <button type="button" role="menuitem" disabled={leader === person.name} onClick={() => { setLeader(person.name); setNotice(`${person.name} foi designada para a liderança do projeto nesta demonstração.`); setSelectedMenu(null); }}>{leader === person.name ? "Gestor atual do projeto" : "Designar gestor do projeto"}</button> : null}
            {canManage ? <button type="button" role="menuitem" className={styles.dangerMenuItem} onClick={() => { setPeople(current => current.filter(candidate => candidate.name !== person.name)); setNotice(`${person.name} foi removida da equipe nesta demonstração.`); setSelectedMenu(null); }}>{person.name === "Marina Lima" ? "Encerrar participação" : "Remover da equipe"}</button> : null}
          </div> : null}</div> : null}</td></tr>)}</tbody></table></div><p className={styles.mobileTableHint}>Deslize a tabela para consultar as demais colunas.</p></> : <div className={styles.emptyState}><strong>{search ? "Nenhum integrante encontrado" : "A equipe ainda está vazia"}</strong><p>{search ? "Tente outra pesquisa por nome ou área." : "Adicione integrantes ativos para começar a construir este projeto em conjunto."}</p>{!search && canManage ? <Button variant="secondary" onClick={() => setInviteOpen(true)}>Adicionar primeiro integrante</Button> : null}</div>}
      {shownPeople.length > pageSize ? <nav className={styles.pagination} aria-label="Paginação de integrantes"><span>Exibindo {page * pageSize + 1}–{Math.min((page + 1) * pageSize, shownPeople.length)} de {shownPeople.length}</span><div><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><button type="button" disabled={(page + 1) * pageSize >= shownPeople.length} onClick={() => setPage(page + 1)}>Próxima</button></div></nav> : null}
    </section> : <section id="team-requests" className={styles.requestContent} role="tabpanel" aria-labelledby="requests-tab"><div className={styles.requestIntro}><div><h2>Solicitações para participar</h2><p>Pedidos de pessoas que querem colaborar com o projeto.</p></div><span>{canDecide ? requests.length : "—"}</span></div>
      {!canDecide ? <p className={styles.emptyState}>A análise de solicitações está disponível para pessoas com essa capacidade.</p> : requests.length ? requests.map(request => <article className={styles.requestRow} key={request.name}><span className={`${styles.personAvatar} ${styles.requestAvatar}`}>{request.initials}</span><div><strong>{request.name}</strong><small>{request.email} · {request.area}</small><span>Solicitou ingresso {request.date}</span></div><div className={styles.requestActions}><button type="button" className={styles.requestAccept} onClick={() => { setRequests(current => current.filter(item => item.name !== request.name)); setNotice(`${request.name} foi aceita nesta demonstração.`); }}>Aceitar</button><button type="button" className={styles.requestDecline} onClick={() => { setRequests(current => current.filter(item => item.name !== request.name)); setNotice(`${request.name} foi recusada nesta demonstração.`); }}>Recusar</button></div></article>) : <div className={styles.emptyState}><strong>Nenhuma solicitação pendente</strong><p>Quando alguém solicitar ingresso, o pedido aparecerá aqui.</p></div>}
    </section>}
    <p className={styles.previewDisclosure} role="status">{notice || "Demonstração isolada · nenhuma alteração é enviada à API"}</p>
  </>;
}

function ProjectSettings({ scenario, onDelete }: { scenario: PreviewScenario; onDelete: () => void }) {
  const [status, setStatus] = useState<ProjectStatus>("ATIVO");
  const [available, setAvailable] = useState(true);
  const [notice, setNotice] = useState("");
  const canChangeStatus = has(scenario, "canChangeStatus");
  const canManageAvailability = has(scenario, "canManageAvailability");
  const transitions = projectTransitions[status];
  return <>
    <header className={styles.pageHeader}><div><span className={styles.eyebrow}>PROJETO AURORA</span><h1>{contextCopy.settings.title}</h1><p>{contextCopy.settings.description}</p></div></header>
    <div className={styles.settingsLayout}>
      <section className={styles.settingsSection} aria-labelledby="status-heading"><div className={styles.settingsLead}><h2 id="status-heading">Situação</h2><p>Situação atual e próximas transições permitidas.</p></div><div className={styles.settingsRows}><div className={styles.settingsRow}><div><strong>Situação atual</strong><small>{statusLabels[status]}</small></div><span className={`${styles.statusPill} ${styles[`status_${status}`]}`}><i/>{statusLabels[status]}</span></div><div className={styles.settingsRow}><div><strong>Transições disponíveis</strong><small>As opções seguem as regras de situação do projeto.</small></div>{canChangeStatus && transitions.length ? <div className={styles.transitionActions}>{transitions.map(next => <button key={next} type="button" className={styles.textAction} onClick={() => { setStatus(next); setNotice(`Situação alterada para ${statusLabels[next]} nesta demonstração.`); }}>{statusActionLabels[next]} <span aria-hidden="true">→</span></button>)}</div> : <span className={styles.readOnlyValue}>{transitions.length ? transitions.map(value => statusActionLabels[value]).join(" · ") : "Sem transições disponíveis"}</span>}</div></div></section>
      <section className={styles.settingsSection} aria-labelledby="availability-heading"><div className={styles.settingsLead}><h2 id="availability-heading">Ingresso</h2><p>Controle se novas solicitações podem ser enviadas.</p></div><div className={styles.settingsRows}><div className={styles.settingsRow}><div><strong>Receber solicitações de participação</strong><small>Interessados podem pedir para participar da equipe.</small></div>{canManageAvailability ? <label className={styles.switchControl}><span>{available ? "Ativado" : "Desativado"}</span><input type="checkbox" role="switch" aria-label="Receber solicitações de participação" checked={available} onChange={event => { setAvailable(event.target.checked); setNotice(event.target.checked ? "Solicitações habilitadas nesta demonstração." : "Solicitações desabilitadas nesta demonstração."); }}/><i/></label> : <span className={styles.readOnlyValue}>{available ? "Ativado" : "Desativado"}</span>}</div></div></section>
      <section className={styles.settingsSection} aria-labelledby="documents-heading"><div className={styles.settingsLead}><h2 id="documents-heading">Documentos</h2><p>Solicitações de exclusão documental vinculadas ao projeto.</p></div><div className={styles.settingsRows}><div className={styles.settingsRow}><div><strong>Solicitações de exclusão</strong><small>Consulte e analise pedidos relativos aos documentos do projeto.</small></div>{has(scenario, "canViewDocuments") ? <button type="button" className={styles.textAction} onClick={() => setNotice("Nenhuma solicitação de exclusão documental aguarda análise nesta demonstração.")}>Ver solicitações <span aria-hidden="true">→</span></button> : <span className={styles.readOnlyValue}>Indisponível para este acesso</span>}</div></div></section>
      {has(scenario, "canDeleteProject") ? <section className={styles.dangerZone} aria-labelledby="danger-heading"><div><h2 id="danger-heading">Zona de risco</h2><p>Excluir o projeto remove sua apresentação das áreas ativas e segue as regras de retenção documental.</p></div><Button variant="destructive" onClick={onDelete}>Excluir projeto</Button></section> : null}
      <p className={styles.settingsNotice} role="status">{notice || "Demonstração isolada · nenhuma alteração é enviada à API"}</p>
    </div>
  </>;
}
