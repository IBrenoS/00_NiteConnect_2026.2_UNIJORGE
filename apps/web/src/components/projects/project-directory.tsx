"use client";

import Link from "next/link";
import { useState } from "react";
import { participationAction, projectStatusLabels, selectProjects, visualCatalog, visualParticipationIds } from "../../lib/projects/visual-data";
import { useProjectVisual } from "./project-visual-provider";
import { EmptyProjects, ProjectBreadcrumb, ProjectMark, ProjectStatusBadge, TemporaryNotice } from "./project-ui";
import styles from "./projects.module.css";

export function ProjectDirectory({ personal = false }: { personal?: boolean }) {
  const { canAdminister, participation, favorites } = useProjectVisual();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState("name");
  const source = visualCatalog.filter(project => personal ? tab === "admin" ? !visualParticipationIds.includes(project.id) && canAdminister : visualParticipationIds.includes(project.id) : tab === "requests" ? Boolean(participation[project.id]) : tab === "favorites" ? favorites.includes(project.id) : true);
  const projects = selectProjects(source, query, status, availability).toSorted((a, b) => sort === "status" ? a.status.localeCompare(b.status) : a.title.localeCompare(b.title, "pt-BR"));
  function reset() { setQuery(""); setStatus("all"); setAvailability("all"); }
  return <div className={styles.page}>
    <ProjectBreadcrumb personal={personal}/><TemporaryNotice/>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>{personal ? "MEU ESPAÇO" : "NÚCLEO"}</p><h1>{personal ? "Meus projetos" : "Projetos"}</h1><p>{personal ? "Seu trabalho ganha contexto aqui. Acompanhe os projetos dos quais você faz parte." : "Conheça o que estamos construindo. Encontre um projeto para contribuir."}</p></div>{personal && <Link href="/projetos" className={styles.button}>Explorar projetos <span aria-hidden="true">↗</span></Link>}</header>
    <div className={styles.tabs} aria-label="Perspectivas de projetos" role="group">
      <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>{personal ? "Participações vigentes" : "Todos os projetos"}<span>{personal ? visualParticipationIds.length : visualCatalog.length}</span></button>
      {personal ? canAdminister && <button aria-pressed={tab === "admin"} onClick={() => setTab("admin")}>Acompanhamento administrativo</button> : <><button aria-pressed={tab === "favorites"} onClick={() => setTab("favorites")}>Favoritos</button><button aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>Meus pedidos <span>{Object.keys(participation).length}</span></button></>}
    </div>
    {personal && tab === "admin" && <p className={styles.contextNote}>Acesso para acompanhamento. Estes projetos não representam participação na equipe.</p>}
    <div className={styles.toolbar}>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar projetos" placeholder="Pesquisar projetos…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery("")} aria-label="Limpar pesquisa">×</button>}</label>
      <label><span className={styles.srOnly}>Situação do projeto</span><select aria-label="Situação do projeto" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas as situações</option>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!personal && <select aria-label="Disponibilidade de participação" value={availability} onChange={e => setAvailability(e.target.value)}><option value="all">Participação</option><option value="open">Recebendo solicitações</option><option value="interest">Manifestar interesse</option></select>}
      <select aria-label="Ordenar projetos" value={sort} onChange={e => setSort(e.target.value)}><option value="name">Nome A–Z</option><option value="status">Situação</option></select>
    </div>
    <div className={styles.resultLine}><span>{projects.length} {projects.length === 1 ? "projeto" : "projetos"}</span><span>{personal ? "≡ Lista" : "▦ Galeria"}</span></div>
    {!projects.length ? <EmptyProjects title={tab === "requests" ? "Nenhum pedido por aqui" : tab === "favorites" ? "Seus favoritos ficam aqui" : "Nenhum projeto encontrado"} description={tab === "requests" ? "As solicitações e manifestações de interesse aparecem aqui para acompanhamento." : "Explore os projetos ou ajuste a pesquisa e os filtros."} reset={reset}/> : personal ? <div className={styles.personalLayout}>
      <div className={styles.tableScroll}><table className={styles.projectTable}><thead><tr><th>Projeto</th><th>Situação</th><th>Gestor</th><th>Seu vínculo</th><th><span className={styles.srOnly}>Abrir</span></th></tr></thead><tbody>{projects.map(project => <tr key={project.id}><td><Link href={`/meus-projetos/${project.id}`} className={styles.projectName}><ProjectMark title={project.title}/><span>{project.title}<small>{project.publicSummary}</small></span></Link></td><td><ProjectStatusBadge project={project}/></td><td>{project.leaderName ?? "Liderança vacante"}</td><td>{tab === "admin" ? "Acompanhamento" : "Integrante"}</td><td><Link href={`/meus-projetos/${project.id}`} aria-label={`Abrir workspace de ${project.title}`}>↗</Link></td></tr>)}</tbody></table></div>
      <aside className={styles.summary}><h2>{tab === "admin" ? "Acompanhamento" : "Seus projetos"}</h2>{Object.entries(projectStatusLabels).map(([value, label]) => <div key={value}><span>{label}</span><strong>{projects.filter(p => p.status === value).length}</strong></div>)}<p>{tab === "admin" ? "Acesso administrativo é diferente de integrar a equipe." : "Apenas participações vigentes compõem esta lista."}</p></aside>
    </div> : <div className={styles.gallery}>{projects.map(project => <Link key={project.id} href={`/projetos/${project.id}`} className={styles.projectCard}><div className={styles.cardTop}><ProjectMark title={project.title}/><ProjectStatusBadge project={project}/></div><h2>{project.title}</h2><p>{project.publicSummary}</p><div className={styles.cardProperties}><span>Gestor</span><strong>{project.leaderName ?? "Liderança vacante"}</strong><span>Equipe</span><strong>{project.teamSize} integrantes</strong></div><footer><span>{participation[project.id] ? participation[project.id].kind === "interest" ? "Interesse registrado · exemplo" : "Pedido pendente · exemplo" : visualParticipationIds.includes(project.id) ? "Você participa · exemplo" : participationAction(project) === "request" ? "Recebendo solicitações" : participationAction(project) === "interest" ? "Aberto a interesse futuro" : "Novas participações encerradas"}</span><span aria-hidden="true">↗</span></footer></Link>)}</div>}
  </div>;
}
