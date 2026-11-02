"use client";

import { useState } from "react";
import { confirmFrequencyHandoff, type FrequencyActionResult } from "../../lib/frequency/actions";
import { Button } from "../ui";

export function HandoffConfirmation() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<FrequencyActionResult | null>(null);

  const confirm = async () => {
    if (pending || result?.kind === "success") return;
    setPending(true);
    try {
      setResult(await confirmFrequencyHandoff());
    } finally {
      setPending(false);
    }
  };

  return <section className="mx-auto grid w-full max-w-xl gap-4 rounded-panel border border-nite-border-soft bg-nite-surface p-5 sm:p-7">
    <div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-brand-accent">B04 · Frequência</p><h1 className="mt-2 font-display text-type-page-title text-nite-text-primary">Concluir sua confirmação</h1><p className="mt-2 text-type-body-compact text-nite-text-secondary">A leitura anterior foi vinculada a esta sessão. A presença só será registrada quando você confirmar abaixo.</p></div>
    {!result ? <Button type="button" onClick={confirm} loading={pending}>Confirmar presença</Button> : result.kind === "success" ? <div role="status" className="rounded-panel border border-status-done-border bg-status-done-soft p-4 text-status-done"><p className="font-semibold">{result.confirmation.alreadyRegistered ? "Presença já confirmada" : "Presença registrada"}</p><p className="mt-1 text-type-body-compact">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(result.confirmation.confirmedAt))}</p></div> : <div><p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft p-3 text-type-body-compact text-status-error">{result.message}</p><a href="/frequency/scan" className="mt-3 inline-flex min-h-10 items-center text-type-body-compact font-medium text-nite-brand-primary underline underline-offset-4">Leia novamente o QR projetado</a></div>}
  </section>;
}
