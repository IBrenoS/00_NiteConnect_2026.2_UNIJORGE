"use client";

import { buttonClassName } from "../ui/button";

import { Button } from "../ui/button";

import { DatePicker, FilterSelect, SearchField } from "../ui";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { ProjectDetails, ProjectStatusEvent, ProjectPeriod, ProjectCandidate } from "../../lib/projects/administration-contracts";
import { projectTransitions, isProjectStatus } from "../../lib/projects/administration-contracts";
import type { WorkspaceOverview, ProjectTeamMember, ProjectStatus } from "../../lib/projects/integration-contracts";
import { createProjectAction, changeProjectCoverAction, updateProjectAction, changeProjectStatusAction, transferProjectLeadershipAction, manageProjectMemberAction } from "../../lib/projects/administration-actions";
import type { ProjectActionResult } from "../../lib/projects/actions";
import { projectStatusLabels } from "../../lib/projects/presentation";
import Image from "next/image";
import { ProjectIssue, Avatar, ProjectMark } from "./project-ui";
import { ProjectAvailability } from "./project-workspace";
import styles from "./projects.module.css";

function Reason() { return <label className={styles.field}>Motivo administrativo<textarea name="reason" required maxLength={1000} rows={2}/><span>Obrigatório · registrado no histórico ou na auditoria.</span></label>; }
function MutationForm({ children, submit, label, onSubmit }: { children: ReactNode; submit: string; label: string; onSubmit: (data: FormData) => Promise<ProjectActionResult<unknown>> }) {
 const router = useRouter();
 const [pending,start] = useTransition();
 const [result,setResult] = useState<{ issue: string | null; text: string } | null>(null);
 return <form aria-label={label} className={styles.adminForm} onSubmit={event => {
  event.preventDefault(); if (pending) return;
  const form = event.currentTarget; const data = new FormData(form); setResult(null);
  start(async () => { const next = await onSubmit(data); setResult({ issue: next.issue, text: next.issueText ?? "Alteração salva." }); if (!next.issue) { form.reset(); router.refresh(); } });
 }}><fieldset disabled={pending} className={styles.adminFieldset}>{children}<Reason/><Button size="compact" variant="primary">{pending ? "Salvando…" : submit}</Button></fieldset>
 {result && <div role={result.issue ? "alert" : "status"}><p>{result.text}</p>{result.issue && <Button size="compact" variant="secondary" type="button" onClick={() => router.refresh()}>Atualizar dados</Button>}</div>}</form>;
}
function ProjectCreationForm() {
 const router = useRouter();
 const [pending,start] = useTransition();
 const [cover,setCover] = useState<File | null>(null);
 const [preview,setPreview] = useState<string | null>(null);
 const [coverError,setCoverError] = useState<string | null>(null);
 const [result,setResult] = useState<{ issue: string | null; text: string } | null>(null);
 const previewUrl=useRef<string|null>(null); const selection=useRef(0);
 useEffect(() => () => { if(previewUrl.current) URL.revokeObjectURL(previewUrl.current); },[]);
 function clearPreview(){if(previewUrl.current){URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;}setPreview(null);}
 async function chooseCover(file: File | undefined) {
  const currentSelection=++selection.current; setCoverError(null); setCover(null); clearPreview(); if (!file) return;
  if (!["image/jpeg","image/png"].includes(file.type)) { setCoverError("Escolha uma imagem PNG ou JPEG."); return; }
  if (file.size > 2 * 1024 * 1024) { setCoverError("A imagem deve ter até 2 MB."); return; }
  const url=URL.createObjectURL(file);
  const dimensions=await new Promise<{width:number;height:number}|null>(resolve => { const image=new window.Image(); image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight}); image.onerror=()=>resolve(null); image.src=url; });
  URL.revokeObjectURL(url);
  if(currentSelection!==selection.current)return;
  if (!dimensions) { setCoverError("Não foi possível abrir esta imagem."); return; }
  if (dimensions.width > 4096 || dimensions.height > 4096) { setCoverError("A imagem não pode ultrapassar 4096 × 4096 px."); return; }
  const preview=URL.createObjectURL(file);previewUrl.current=preview;setPreview(preview);setCover(file);
 }
 return <form aria-label="Criar projeto" className={styles.creationForm} onSubmit={event => {
  event.preventDefault(); if (pending) return;
  const form=event.currentTarget; const data=new FormData(form);
  const startsOn=String(data.get("startsOn") ?? "") || null; const endsOn=String(data.get("endsOn") ?? "") || null;
  if (startsOn && endsOn && startsOn > endsOn) { setResult({issue:"invalid",text:"A previsão de término precisa ser igual ou posterior ao início."}); return; }
  const status=data.get("initialStatus"); if (status !== "PLANEJAMENTO" && status !== "ATIVO" && status !== "PAUSADO") { setResult({issue:"invalid",text:"Selecione uma situação inicial válida."}); return; }
  setResult(null); start(async () => { const next=await createProjectAction({ title:String(data.get("title") ?? ""), description:String(data.get("description") ?? ""), startsOn, endsOn, initialStatus:status, image:cover });
   setResult({issue:next.issue,text:next.issueText ?? "Projeto criado."}); if (!next.issue && next.data) router.push(`/projetos/${next.data.id}`);
  });
 }}>
  <div className={styles.creationGrid}>
   <section className={styles.creationIdentity} aria-labelledby="creation-identity-title">
    <header><span className={styles.sectionEyebrow}>01 · Identificação</span><h2 id="creation-identity-title">Sobre o projeto</h2><p>Defina como ele será reconhecido no catálogo institucional.</p></header>
    <div className={styles.coverUpload}>
     <div className={styles.coverPreview}>{preview ? <Image src={preview} alt="Prévia da imagem de capa" fill sizes="144px" unoptimized/> : <ProjectMark title={"Novo projeto"} detail/>}</div>
     <div className={styles.coverCopy}><strong>Imagem de capa</strong><span>PNG ou JPEG · até 2 MB · 4096 × 4096 px</span><label className={buttonClassName({size:"compact",variant:"secondary"})}>{cover ? "Substituir imagem" : "Adicionar imagem"}<input aria-label="Imagem de capa" type="file" accept="image/png,image/jpeg" onChange={event => { void chooseCover(event.currentTarget.files?.[0]); event.currentTarget.value=""; }}/></label>{cover && <button type="button" className={styles.removeCover} onClick={() => { selection.current++;setCover(null);clearPreview();setCoverError(null); }}>Remover</button>}{coverError && <span role="alert" className={styles.coverError}>{coverError}</span>}</div>
    </div>
    <label className={styles.field}>Título<input name="title" required maxLength={200} autoComplete="off" placeholder="Ex.: Formação de novos pesquisadores"/></label>
    <label className={styles.field}>Descrição<textarea name="description" required maxLength={10000} rows={5} placeholder="Descreva o propósito e o escopo do projeto."/></label>
   </section>
   <section className={styles.creationSettings} aria-labelledby="creation-settings-title">
    <header><span className={styles.sectionEyebrow}>02 · Configuração inicial</span><h2 id="creation-settings-title">Organização</h2><p>Escolha a situação e informe as datas previstas. Elas podem ficar em branco.</p></header>
    <fieldset className={styles.statusChoices}><legend>Situação inicial</legend>{([["PLANEJAMENTO","Planejamento","Preparação do projeto"],["ATIVO","Em andamento","Execução já iniciada"],["PAUSADO","Pausado","Equipe pode ser formada sem executar atividades"]] as const).map(([value,label,description])=><label key={value} data-selected={undefined}><input type="radio" name="initialStatus" value={value} defaultChecked={value==="PLANEJAMENTO"}/><span><strong>{label}</strong><small>{description}</small></span></label>)}</fieldset>
    <div className={styles.creationDates}><label className={styles.field}>Data de início <span>Opcional</span><DatePicker aria-label="Data de início Opcional" name="startsOn"/></label><label className={styles.field}>Previsão de término <span>Opcional</span><DatePicker aria-label="Previsão de término Opcional" name="endsOn"/></label></div>
    <aside className={styles.creationNote}><strong>Equipe e liderança</strong><p>Criar o projeto não adiciona você nem outra pessoa à equipe e não designa gestor. Essas ações são feitas separadamente por quem tem autorização.</p></aside>
   </section>
  </div>
  <footer className={styles.creationFooter}><Link className={buttonClassName({size:"compact",variant:"secondary"})} href="/projetos">Cancelar</Link><Button size="compact" variant="primary" disabled={pending || Boolean(coverError)}>{pending ? "Criando projeto…" : "Criar projeto"}</Button></footer>
  {result?.issue && <p role="alert" className={styles.formFeedback}>{result.text}</p>}
 </form>;
}
export function ProjectDetailsForm({ project }: { project?: ProjectDetails }) {
 if (!project) return <ProjectCreationForm/>;
 return <MutationForm label={project ? "Editar dados do projeto" : "Criar projeto"} submit={project ? "Salvar dados" : "Criar projeto"} onSubmit={async data => {
  const input = { title: String(data.get("title") ?? ""), description: String(data.get("description") ?? ""), startsOn: String(data.get("startsOn") ?? "") || null, endsOn: String(data.get("endsOn") ?? "") || null, reason: String(data.get("reason") ?? "") };
  const result = await updateProjectAction(project.id, { ...input, expectedVersion: project.version });
  return result;
 }}>
  <label className={styles.field}>Título<input name="title" required maxLength={200} defaultValue={project?.title}/></label>
  <label className={styles.field}>Descrição<textarea name="description" required maxLength={10000} rows={6} defaultValue={project?.description}/></label>
  <div className={styles.adminDates}><label className={styles.field}>Data de início <span>Opcional</span><DatePicker aria-label="Data de início Opcional"  name="startsOn" defaultValue={project?.startsOn ?? ""}/></label><label className={styles.field}>Data de término <span>Opcional</span><DatePicker aria-label="Data de término Opcional"  name="endsOn" defaultValue={project?.endsOn ?? ""}/></label></div>
 </MutationForm>;
}
function ProjectCoverEditor({ projectId, expectedVersion, title, imageUrl }: { projectId: string; expectedVersion: number; title: string; imageUrl: string | null }) {
 const router=useRouter(); const [file,setFile]=useState<File|null>(null); const [preview,setPreview]=useState<string|null>(null); const [pending,start]=useTransition(); const [message,setMessage]=useState<string|null>(null); const [error,setError]=useState<string|null>(null);
 const previewUrl=useRef<string|null>(null);const selection=useRef(0);const [removed,setRemoved]=useState(false);
 useEffect(()=>()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);},[]);
 function clearPreview(){if(previewUrl.current){URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;}setPreview(null);}
 async function readFile(candidate:File|undefined){const currentSelection=++selection.current;setError(null);setFile(null);clearPreview();if(!candidate)return;if(!["image/jpeg","image/png"].includes(candidate.type)){setError("Escolha uma imagem PNG ou JPEG.");return;}if(candidate.size===0||candidate.size>2*1024*1024){setError("A imagem precisa ter entre 1 byte e 2 MB.");return;}const url=URL.createObjectURL(candidate);const dimension=await new Promise<{width:number;height:number}|null>(resolve=>{const image=new window.Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve(null);image.src=url;});URL.revokeObjectURL(url);if(currentSelection!==selection.current)return;if(!dimension){setError("Não foi possível abrir esta imagem.");return;}if(dimension.width>4096||dimension.height>4096){setError("A imagem não pode ultrapassar 4096 × 4096 px.");return;}const nextPreview=URL.createObjectURL(candidate);previewUrl.current=nextPreview;setPreview(nextPreview);setFile(candidate);}
 function save(image:File|null){setMessage(null);setError(null);start(async()=>{const result=await changeProjectCoverAction(projectId,expectedVersion,image);if(result.issue){setError(result.issueText??"Não foi possível atualizar a imagem de capa.");return;}selection.current++;setFile(null);clearPreview();setRemoved(image===null);setMessage(image?"Imagem de capa atualizada.":"Imagem de capa removida.");router.refresh();});}
 const visibleImage=preview??(!removed?imageUrl:null);
 return <section className={styles.coverEditor} aria-label="Imagem de capa do projeto"><div className={styles.coverEditorPreview}>{visibleImage?<Image src={visibleImage} alt={`Imagem de capa de ${title}`} fill sizes="160px" unoptimized/>:<ProjectMark title={title}/>}</div><div className={styles.coverEditorBody}><div><strong>Imagem de capa</strong><p>PNG ou JPEG · até 2 MB · 4096 × 4096 px.</p></div><label className={buttonClassName({size:"compact",variant:"secondary"})}>{file||(!removed&&imageUrl)?"Substituir imagem":"Adicionar imagem"}<input aria-label="Imagem de capa do projeto" type="file" accept="image/png,image/jpeg" disabled={pending} onChange={event=>{void readFile(event.currentTarget.files?.[0]);event.currentTarget.value="";}}/></label>{file&&<><Button size="compact" type="button" variant="primary" disabled={pending} onClick={()=>save(file)}>{pending?"Salvando…":"Salvar imagem"}</Button><Button size="compact" type="button" variant="secondary" disabled={pending} onClick={()=>{selection.current++;setFile(null);clearPreview();setError(null);}}>Cancelar substituição</Button></>}{!file&&imageUrl&&!removed&&<Button size="compact" type="button" variant="secondary" disabled={pending} onClick={()=>save(null)}>{pending?"Removendo…":"Remover imagem"}</Button>}{error&&<p role="alert" className={styles.formFeedback}>{error}</p>}{message&&<p role="status" className={styles.formFeedback}>{message}</p>}</div></section>;
}
export function ProjectAdministration({ workspace, members, candidates, statusHistory, participationHistory, leadershipHistory, canChangeStatus, issues, candidateSearch = "", coverImageUrl = null }: {
 workspace: WorkspaceOverview; members: ProjectTeamMember[]; candidates: ProjectCandidate[]; statusHistory: ProjectStatusEvent[]; participationHistory: ProjectPeriod[]; leadershipHistory: ProjectPeriod[]; canChangeStatus: boolean; issues: string[]; candidateSearch?: string; coverImageUrl?: string | null;
}) {
 const w = workspace;
 const project: ProjectDetails = { id: w.projectId, title: w.name, description: w.description, startsOn: w.startsOn, endsOn: w.endsOn, status: w.status, version: w.version };
 const base = { expectedVersion: w.version };
 const names = new Map([...candidates.map(m => [m.id,m.name] as const), ...members.map(m => [m.memberId,m.memberName ?? m.memberId] as const)]);
 function reason(data: FormData) { return String(data.get("reason") ?? ""); }
 const labels: Record<ProjectStatus,string> = { PLANEJAMENTO: "Planejar", ATIVO: "Ativar", PAUSADO: "Pausar", CONCLUIDO: "Concluir" };
 return <div className={styles.page}>
 <header className={styles.pageHeader}><div><h1>Administrar projeto</h1><p>{w.name}</p></div><Link className={buttonClassName({ size: "compact", variant: "secondary" })} href={`/projetos/${w.projectId}`}>Voltar ao detalhe</Link></header>
 {issues.map(issue => <ProjectIssue key={issue} issue={issue}/>)}
 <div className={styles.adminLayout}>
 <section className={styles.adminPanel}><h2>Dados do projeto</h2><p className={styles.contextNote}>Versão {w.version} · alterações de dados são registradas na auditoria.</p><ProjectCoverEditor projectId={w.projectId} expectedVersion={w.version} title={w.name} imageUrl={coverImageUrl}/><ProjectDetailsForm key={w.version} project={project}/></section>
 <aside className={styles.adminControls}>
 {canChangeStatus && w.capabilities.canViewDocuments && <section className={styles.adminPanel}><h2>Documentos</h2><Link className={styles.textLink} href={`/meus-projetos/${w.projectId}/documentos/aprovacoes`}>Solicitações de exclusão →</Link></section>}
 {canChangeStatus && <section className={styles.adminPanel}><h2>Situação</h2><p>Atual: {projectStatusLabels[w.status]}</p><MutationForm key={`status-${w.version}`} label="Alterar situação" submit="Alterar situação" onSubmit={data => { const status = data.get("status"); return isProjectStatus(status) ? changeProjectStatusAction(w.projectId,{ ...base, status, reason: reason(data) }) : Promise.resolve({ data: null, issue: "invalid", issueText: "Selecione uma situação válida." }); }}><label className={styles.field}>Próxima situação<FilterSelect name="status" required>{projectTransitions[w.status].map(s => <option key={s} value={s}>{labels[s]}</option>)}</FilterSelect></label></MutationForm></section>}
 {w.capabilities.canManageAvailability && <section className={styles.adminPanel}><h2>Ingresso</h2><ProjectAvailability workspace={w}/></section>}
 {w.capabilities.canTransferLeadership && <section className={styles.adminPanel}><h2>Designar gestor do projeto</h2><p>{w.leaderName ?? "Sem gestor definido"}</p><p className={styles.contextNote}>Selecione uma pessoa com participação vigente. O backend também exige o papel institucional GESTOR_PROJETO, GESTOR_GERAL ou COORDENADOR.</p>{members.length ? <MutationForm key={`leader-${w.version}`} label="Designar gestor do projeto" submit="Designar gestor" onSubmit={data => transferProjectLeadershipAction(w.projectId,{ ...base, memberId: String(data.get("memberId") ?? "") || null, reason: reason(data) })}><label className={styles.field}>Integrante da equipe<FilterSelect name="memberId" required defaultValue={w.leaderId ?? ""}><option value="">Selecione pelo nome</option>{members.map(m => <option key={m.id} value={m.memberId}>{m.memberName ?? "Nome indisponível"}</option>)}</FilterSelect></label><p className={styles.contextNote}>Se a pessoa ainda não participa, adicione-a à equipe primeiro. Se ela não tem papel elegível, a gestão geral ou a coordenação deve conceder GESTOR_PROJETO em <Link href="/gestao/acessos-e-convites?tab=permissoes">Acessos e convites → Permissões</Link>. Dar o papel não cria participação nem designa a liderança.</p></MutationForm> : <p className={styles.contextNote}>Não há integrantes com participação vigente. Adicione a pessoa à equipe antes de designar um gestor.</p>}</section>}
 </aside>
 </div>
 <section className={styles.adminPanel} id="participation"><h2>Participação</h2><p className={styles.contextNote}>Administração global, participação e liderança são vínculos separados.</p>
 {members.length ? <div className={styles.teamList}>{members.map(m => <article className={styles.adminMember} key={m.id}><div className={styles.projectName}><Avatar name={m.memberName ?? "Integrante"} memberId={m.memberId}/><span><strong>{m.memberName ?? m.memberId}</strong><small>{m.responsibility}</small></span></div>{m.memberId === w.leaderId ? <p className={styles.contextNote}>Transfira ou encerre a liderança antes de encerrar a participação.</p> : <details><summary>Encerrar participação</summary><MutationForm key={`${m.id}-${w.version}`} label={`Encerrar participação de ${m.memberName ?? m.memberId}`} submit="Confirmar encerramento" onSubmit={data => manageProjectMemberAction(w.projectId,{ ...base, operation: "end", memberId: m.memberId, reason: reason(data) })}><p>O vínculo será encerrado; o histórico e as contribuições serão preservados.</p></MutationForm></details>}</article>)}</div> : <p>Nenhuma participação vigente.</p>}
 <details className={styles.adminDisclosure} open={!!candidateSearch}><summary>Adicionar integrante</summary><form method="get" className={styles.adminSearch}><label className={styles.field}>Pesquisar integrante ativo<SearchField name="integrante" minLength={2} maxLength={160} required defaultValue={candidateSearch} placeholder="Pelo menos 2 caracteres"/></label><Button size="compact" variant="secondary">Pesquisar integrante</Button></form>{candidates.length ? <MutationForm key={`join-${w.version}`} label="Adicionar integrante" submit="Adicionar à equipe" onSubmit={data => manageProjectMemberAction(w.projectId,{ ...base, operation: "join", memberId: String(data.get("memberId") ?? ""), responsibility: String(data.get("responsibility") ?? ""), reason: reason(data) })}><label className={styles.field}>Integrante ativo<FilterSelect name="memberId" required><option value="">Selecione uma pessoa</option>{candidates.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</FilterSelect></label><label className={styles.field}>Responsabilidade<input name="responsibility" required maxLength={200}/></label></MutationForm> : <p>{candidateSearch ? "Nenhum integrante elegível encontrado para esta pesquisa." : "Pesquise pelo nome para consultar integrantes elegíveis."}</p>}</details>
 <Link className={styles.textLink} href={`/meus-projetos/${w.projectId}/equipe`}>Consultar equipe e solicitações →</Link>
 </section>
 <section className={styles.adminPanel}><h2>Históricos</h2>
 <details className={styles.adminDisclosure}><summary>Histórico de situações ({statusHistory.length})</summary>{statusHistory.length ? statusHistory.map(e => <article className={styles.adminHistory} key={e.id}><strong>{e.previousStatus ? `${projectStatusLabels[e.previousStatus]} → ` : "Criação → "}{projectStatusLabels[e.newStatus]}</strong><time dateTime={e.occurredAt}>{new Date(e.occurredAt).toLocaleString("pt-BR")}</time><p>{e.reason}</p></article>) : <p>Nenhum evento retornado.</p>}</details>
 {([ ["Histórico de participações",participationHistory], ["Histórico de liderança",leadershipHistory] ] as const).map(([title,periods]) => <details key={title} className={styles.adminDisclosure}><summary>{title} ({periods.length})</summary>{periods.length ? periods.map(p => <article className={styles.adminHistory} key={p.id}><strong>{p.memberId ? names.get(p.memberId) ?? `Integrante ${p.memberId}` : "Sem gestor definido"}</strong>{p.responsibility && <p>{p.responsibility}</p>}<p>{new Date(p.startedAt).toLocaleString("pt-BR")} → {p.endedAt ? new Date(p.endedAt).toLocaleString("pt-BR") : "Vigente"}</p><p>Motivo inicial: {p.startReason}</p>{p.endReason && <p>Motivo de encerramento: {p.endReason}</p>}</article>) : <p>Nenhum período registrado.</p>}</details>)}
 </section>
 </div>;
}
