"use client";

import { useEffect, useRef } from "react";

/** WOPI's access_token is an editor-scoped capability token, not the user's Entra Bearer token. */
export function CollaboraFrame({actionUrl,token,ttl,title}:{actionUrl:string;token:string;ttl:number;title:string}) {
  const form=useRef<HTMLFormElement>(null);
  const started=useRef(false);
  useEffect(()=>{if(!started.current){started.current=true;form.current?.submit();}},[]);
  return <div className="space-y-3">
    <form ref={form} action={actionUrl} method="POST" target="nite-collabora-editor">
      <input type="hidden" name="access_token" value={token} />
      <input type="hidden" name="access_token_ttl" value={ttl} />
      <noscript><button type="submit">Abrir editor</button></noscript>
    </form>
    <iframe name="nite-collabora-editor" title={`Editar ${title}`} referrerPolicy="no-referrer"
      allow="clipboard-read; clipboard-write; fullscreen" className="h-[75vh] min-h-[520px] w-full rounded-control border border-nite-border-soft" />
  </div>;
}
