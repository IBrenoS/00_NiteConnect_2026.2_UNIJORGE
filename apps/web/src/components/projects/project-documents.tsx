"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LibraryExplorer } from "../documents/library-explorer";
import { Dialog } from "../ui/dialog";
import { getVisualDocuments } from "../../lib/projects/visual-documents";
import styles from "./projects.module.css";

export function ProjectDocuments({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listing = getVisualDocuments(projectId, params.get("folder") ?? undefined, query);
  return <section className={styles.sectionPage}><header className={styles.sectionHeader}><div><h2>Documentos</h2><p>Arquivos e referências compartilhados do projeto.</p></div><button className={styles.button} onClick={() => setOpen(true)}>+ Adicionar documento</button></header><div className={styles.documentNote}>Biblioteca do projeto · arquivos de exemplo, sem conteúdo real. Nenhum arquivo será enviado nesta etapa.</div><div className={styles.toolbar}><label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Pesquisar documentos do projeto" placeholder="Pesquisar documentos…" value={query} onChange={e => setQuery(e.target.value)}/></label></div><LibraryExplorer listing={listing} base={`/meus-projetos/${projectId}/documentos`} temporary/>
    <Dialog open={open} onOpenChange={setOpen} title="Adicionar documento" description="Biblioteca do projeto"><div className={styles.dialogBody}><p>A criação, o upload e o download utilizarão a infraestrutura documental existente na próxima etapa. Nenhum arquivo será enviado agora.</p><button className={styles.primaryButton} onClick={() => setOpen(false)}>Entendi</button></div></Dialog>
  </section>;
}
