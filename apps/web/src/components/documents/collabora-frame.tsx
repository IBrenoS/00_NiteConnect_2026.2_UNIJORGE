"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const FRAME_LOAD_TIMEOUT_MS = 45_000;

/** WOPI's access_token is an editor-scoped capability token, not the user's Entra Bearer token. */
export function CollaboraFrame({ actionUrl, token, ttl, title }: { actionUrl: string; token: string; ttl: number; title: string }) {
  const form = useRef<HTMLFormElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const started = useRef(false);
  const timeout = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      form.current?.submit();
    }
  }, []);

  useEffect(() => {
    timeout.current = window.setTimeout(() => setFailed(true), FRAME_LOAD_TIMEOUT_MS);
    return () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    };
  }, []);

  function handleFrameLoad() {
    try {
      if (frame.current?.contentWindow?.location.href === "about:blank") return;
    } catch {
      // A cross-origin URL means the frame navigated away from its initial blank document.
    }
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    setFailed(false);
  }

  function handleFrameError() {
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    setFailed(true);
  }

  if (failed) {
    return (
      <main className="grid h-dvh w-dvw place-items-center overflow-auto bg-nite-background p-6">
        <section role="alert" className="w-full max-w-lg space-y-4 text-center">
          <h1 className="font-display text-type-page-title text-nite-text-primary">Não foi possível abrir o editor</h1>
          <p className="text-type-body-compact text-nite-text-secondary">
            O Collabora não respondeu. A sessão WOPI continua protegida pelo servidor; você pode retornar aos seus arquivos e tentar novamente.
          </p>
          <Link href="/documentos" className="inline-flex min-h-11 items-center justify-center rounded-control px-4 font-medium text-nite-brand-primary underline underline-offset-4">
            Voltar a Meus Arquivos
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="h-dvh w-dvw overflow-hidden bg-nite-background">
      <form ref={form} action={actionUrl} method="POST" target="nite-collabora-editor" className="hidden">
        <input type="hidden" name="access_token" value={token} />
        <input type="hidden" name="access_token_ttl" value={ttl} />
      </form>
      <iframe
        ref={frame}
        name="nite-collabora-editor"
        title={`Editar ${title}`}
        referrerPolicy="no-referrer"
        allow="clipboard-read; clipboard-write; fullscreen"
        onLoad={handleFrameLoad}
        onError={handleFrameError}
        className="block h-full w-full border-0"
      />
    </main>
  );
}
