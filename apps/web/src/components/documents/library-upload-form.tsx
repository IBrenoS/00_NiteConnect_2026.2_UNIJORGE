"use client";
import { useState,type ChangeEvent } from "react";
import { uploadLibraryFile } from "../../lib/documents/library-actions";
export function LibraryUploadForm({folderId,returnTo}:{folderId:string;returnTo:string}) {
  const [title,setTitle]=useState("");
  const [custom,setCustom]=useState(false);
  function chooseFile(event:ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];
    if(!custom)setTitle(file?.name??"");
  }
  return <form action={uploadLibraryFile} className="grid gap-3 rounded-control border border-nite-border-soft p-4">
    <input type="hidden" name="folderId" value={folderId}/>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Arquivo DOCX, PDF ou imagem (até 8 MiB)
      <input type="file" name="file" required accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={chooseFile} className="min-h-10"/>
    </label>
    <label className="grid gap-1 text-type-body-compact text-nite-text-secondary">Nome do arquivo
      <input name="title" required value={title} onChange={e=>{setTitle(e.target.value);setCustom(true);}} maxLength={190}
        placeholder="Nome original do arquivo" className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-3"/>
    </label>
    <button className="min-h-10 justify-self-start rounded-control bg-nite-brand-primary px-4 font-medium text-white">Adicionar arquivo</button>
  </form>;
}
