"use client";

import { useEffect, useState, useTransition } from "react";
import { confirmFrequencyQr, type FrequencyActionResult } from "../../lib/frequency/actions";
import { signInWithMicrosoft } from "../../lib/auth/actions";
import { Button } from "../ui";
import { tokenFromFragment } from "../../lib/frequency/qr";

type State = { kind: "reading" } | { kind: "handoff-ready"; expiresAt: string } | { kind: "confirm"; token: string } | { kind: "result"; result: FrequencyActionResult } | { kind: "error"; message: string };

export function ScanHandoff({ authenticated }: { authenticated: boolean }) {
  const [state, setState] = useState<State>({ kind: "reading" });
  const [pending, startTransition] = useTransition();
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(Date.now()), 0);
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const token = tokenFromFragment(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      window.setTimeout(() => setState({ kind: "error", message: "O QR não contém um código válido. Solicite a exibição de um novo código à gestão." }), 0);
      return;
    }
    if (authenticated) {
      window.setTimeout(() => setState({ kind: "confirm", token }), 0);
      return;
    }
    let active = true;
    void fetch("/api/frequency/qr/handoffs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ qrToken: token }),
      cache: "no-store",
      credentials: "same-origin",
      referrerPolicy: "no-referrer",
    }).then(async (response) => {
      if (!active) return;
      const payload: unknown = await response.json().catch(() => null);
      const expiresAt = typeof payload === "object" && payload !== null && "expiresAt" in payload && typeof payload.expiresAt === "string" ? payload.expiresAt : "";
      if (!response.ok || !expiresAt) {
        setState({ kind: "error", message: response.status === 409 ? "Este QR expirou ou foi renovado. Faça uma nova leitura do código projetado." : response.status === 429 ? "Muitas tentativas de leitura. Aguarde o intervalo informado e leia o QR novamente." : "Não foi possível preparar o acesso seguro. Tente ler o QR novamente." });
        return;
      }
      setState({ kind: "handoff-ready", expiresAt });
    }).catch(() => {
      if (active) setState({ kind: "error", message: "Sem conexão para preparar a confirmação. Verifique a rede e leia o QR novamente." });
    });
    return () => { active = false; };
  }, [authenticated]);

  const confirm = () => {
    if (state.kind !== "confirm") return;
    const token = state.token;
    startTransition(() => {
      void confirmFrequencyQr(token).then((result) => setState({ kind: "result", result }));
    });
  };
  const handoffExpired = state.kind === "handoff-ready" && clock > 0 && clock >= Date.parse(state.expiresAt);

  return <main className="grid min-h-svh place-items-center bg-nite-background px-4 py-8 text-nite-text-primary">
    <section className="w-full max-w-md rounded-panel border border-nite-border-soft bg-nite-surface p-5 shadow-nite-floating sm:p-7">
      <div className="mb-7 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-control bg-nite-brand-primary font-display font-semibold text-nite-action-text">N</span><span className="font-display text-type-label font-semibold">NITE Connect</span><span className="ml-auto text-type-metadata text-nite-text-muted">Frequência</span></div>
      {state.kind === "reading" ? <><h1 className="font-display text-type-section-title">Validando o QR Code</h1><p role="status" className="mt-2 text-type-body-compact text-nite-text-secondary">Preparando a continuidade protegida…</p></> : null}
      {state.kind === "handoff-ready" ? <><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-brand-accent">Continuação protegida</p><h1 className="mt-2 font-display text-type-section-title">{handoffExpired ? "O acesso expirou" : "Entre para confirmar"}</h1><p className="mt-2 text-type-body-compact text-nite-text-secondary">{handoffExpired ? "O prazo terminou antes da confirmação. Leia novamente o QR projetado com a câmera do aparelho." : <>O código ficará válido até {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(state.expiresAt))}. Depois do login, revise e confirme explicitamente.</>}</p>{!handoffExpired ? <form action={signInWithMicrosoft} className="mt-6"><Button type="submit" className="w-full">Continuar com Microsoft</Button></form> : null}</> : null}
      {state.kind === "confirm" ? <><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-brand-accent">Sessão autenticada</p><h1 className="mt-2 font-display text-type-section-title">Confirmar sua presença?</h1><p className="mt-2 text-type-body-compact text-nite-text-secondary">A leitura não registra presença sozinha. A confirmação só ocorre depois desta ação e da validação da API.</p><Button type="button" className="mt-6 w-full" loading={pending} onClick={confirm}>Confirmar presença</Button></> : null}
      {state.kind === "result" ? (state.result.kind === "success"
        ? <div role="status"><span className="inline-flex size-10 items-center justify-center rounded-full bg-status-done-soft text-status-done" aria-hidden="true">✓</span><h1 className="mt-4 font-display text-type-section-title">{state.result.confirmation.alreadyRegistered ? "Presença já confirmada" : "Presença registrada"}</h1><p className="mt-2 text-type-body-compact text-nite-text-secondary">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(state.result.confirmation.confirmedAt))}</p></div>
        : <p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft p-3 text-type-body-compact text-status-error">{state.result.message}</p>) : null}
      {state.kind === "error" ? <div><p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft p-3 text-type-body-compact text-status-error">{state.message}</p><a href="/frequencia" className="mt-4 inline-flex min-h-11 items-center font-medium text-nite-brand-primary underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Abrir Frequência</a></div> : null}
    </section>
  </main>;
}
