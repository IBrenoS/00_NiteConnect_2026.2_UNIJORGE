"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./projects.module.css";
import { ProjectDeleteDialog } from "./project-delete-dialog";

type Props = { projectId: string; name: string; canEdit: boolean; canManageTeam: boolean; canConfigure: boolean; canDelete: boolean };

export function ProjectContextMenu({ projectId, name, canEdit, canManageTeam, canConfigure, canDelete }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!canEdit && !canManageTeam && !canConfigure && !canDelete) return null;

  return <>
    <details className={styles.projectMenu}>
      <summary aria-label="Ações do projeto"><span aria-hidden="true">···</span></summary>
      <div role="group" aria-label="Ações do projeto">
        {canEdit ? <Link href={`/projetos/${projectId}?dialog=edit`}>Editar projeto</Link> : null}
        {canManageTeam ? <Link href={`/projetos/${projectId}/equipe`}>Gerenciar equipe</Link> : null}
        {canConfigure ? <Link href={`/projetos/${projectId}/configuracoes`}>Configurações do projeto</Link> : null}
        {canDelete ? <><hr/><button type="button" className={styles.projectMenuDanger} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); setConfirmOpen(true); }}>Excluir projeto</button></> : null}
      </div>
    </details>
    <ProjectDeleteDialog projectId={projectId} name={name} open={confirmOpen} onOpenChange={setConfirmOpen}/>
  </>;
}
