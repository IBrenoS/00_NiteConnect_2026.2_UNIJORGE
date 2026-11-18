"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { participationAction, visualCatalog, visualParticipationIds } from "../../lib/projects/visual-data";
import { useProjectVisual } from "./project-visual-provider";
import { ProjectBreadcrumb, ProjectMark, ProjectProperties, ProjectStatusBadge, TemporaryNotice } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectPresentation({ projectId }: { projectId: string }) {
  const project = visualCatalog.find(p => p.id === projectId)!;
  const { canAdminister, participation, setParticipation, favorites, setFavorites } = useProjectVisual();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const action = participationAction(project);
  const own = participation[projectId];
  const hasWorkspace = visualParticipationIds.includes(projectId) || canAdminister;
  const favorite = favorites.includes(projectId);
  return <div className={styles.page}><ProjectBreadcrumb title={project.title}/><TemporaryNotice/>
    <div className={styles.presentationLayout}><article className={styles.presentation}>
      <div className={styles.presentationActions}><ProjectMark title={project.title} large/><button className={styles.iconButton} aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={favorite} onClick={() => setFavorites(ids => favorite ? ids.filter(id => id !== projectId) : [...ids, projectId])}>{favorite ? "★" : "☆"}</button></div>
      <h1>{project.title}</h1><p className={styles.lead}>{project.publicSummary}</p>
      <div className={styles.inlineProperties}><ProjectStatusBadge project={project}/><span>{project.leaderName ?? "Liderança vacante"}</span><span>{project.teamSize} integrantes</span></div>
      <section className={styles.participationPanel}><h2>{visualParticipationIds.includes(projectId) ? "Você faz parte deste projeto" : project.status === "CONCLUIDO" ? "Um ciclo concluído" : "Sua contribuição pode fazer parte"}</h2><p>{visualParticipationIds.includes(projectId) ? "Acompanhe as atividades, a equipe e os documentos no workspace." : action === "interest" ? "Este projeto está pausado ou sem liderança. Você pode manifestar interesse para uma oportunidade futura. Isso não cria um pedido de ingresso." : action === "request" ? "Envie uma solicitação à gestão do projeto. Sua participação depende de aprovação." : "Este projeto não recebe novas solicitações de participação neste momento."}</p>
        {hasWorkspace && <Link className={styles.primaryButton} href={`/meus-projetos/${projectId}`}>Abrir workspace <span aria-hidden="true">↗</span></Link>}
        {!visualParticipationIds.includes(projectId) && action && !own && <button className={styles.primaryButton} onClick={() => { setOpen(true); setSuccess(false); }}>{action === "interest" ? "Manifestar interesse" : "Solicitar participação"}</button>}
        {own?.state === "PENDENTE" && <div className={styles.requestTracking}><strong>{own.kind === "request" ? "◷ Solicitação aguardando decisão" : "♡ Interesse futuro registrado"} · exemplo</strong><p>{own.message || "Nenhuma mensagem adicionada."}</p></div>}
        
      </section>
      <section className={styles.editorial}><h2>Sobre o projeto</h2><p>{project.publicSummary}</p><h3>Como participar</h3><p>{project.status === "CONCLUIDO" ? "O ciclo deste projeto foi encerrado. Explore outros projetos do núcleo para encontrar oportunidades de colaboração." : project.leadershipVacant ? "Uma nova liderança precisa ser definida antes do ingresso de integrantes. Manifeste seu interesse para uma possível retomada." : "Conheça a proposta, converse com a gestão e compartilhe como gostaria de contribuir. O ingresso na equipe é analisado pela gestão autorizada."}</p><div className={styles.privacyNote}><span aria-hidden="true">◇</span><p>Esta apresentação reúne apenas informações públicas do projeto. Atividades, equipe nominal e documentos ficam no workspace, conforme o acesso autorizado.</p></div></section>
    </article><aside className={styles.propertyPanel}><h2>Informações do projeto</h2><ProjectProperties project={project}/><Link className={styles.textLink} href="/projetos">← Voltar ao catálogo</Link></aside></div>
    <Dialog open={open} onOpenChange={setOpen} title={success ? action === "interest" ? "Interesse registrado nesta sessão" : "Solicitação preparada nesta sessão" : action === "interest" ? "Manifestar interesse" : "Solicitar participação"} description={project.title}>
      {success ? <div className={styles.dialogBody}><div className={styles.successMark} aria-hidden="true">✓</div><h3>{action === "interest" ? "Interesse em uma oportunidade futura" : "Aguardando decisão da gestão"}</h3><p>Este é um estado temporário da interface. Nenhuma solicitação foi enviada e nenhuma participação foi criada.</p><button className={styles.primaryButton} onClick={() => setOpen(false)}>Concluir</button></div> : <form className={styles.dialogBody} onSubmit={event => { event.preventDefault(); if (!action) return; setParticipation(items => ({ ...items, [projectId]: { kind: action, message: message.trim(), state: "PENDENTE" } })); setSuccess(true); }}><p>{action === "interest" ? "Manifeste seu interesse em contribuir quando houver condições para novos ingressos." : "Conte à gestão como você gostaria de contribuir. Sua entrada na equipe depende de aprovação."}</p><label className={styles.field}>Mensagem para a gestão <span>Opcional · até 2.000 caracteres</span><textarea autoFocus value={message} maxLength={2000} rows={5} onChange={e => setMessage(e.target.value)} placeholder="O que te conecta a este projeto?"/></label><p className={styles.contextNote}>Interação temporária. Não envia dados nem altera sua participação real.</p><div className={styles.dialogFooter}><button type="button" className={styles.button} onClick={() => setOpen(false)}>Cancelar</button><button className={styles.primaryButton}>Confirmar {action === "interest" ? "interesse" : "solicitação"} local</button></div></form>}
    </Dialog>
  </div>;
}
