"use client";

import { Button } from "../ui/button";

import { FilterSelect } from "../ui";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeMemberStatus } from "../../lib/members/actions";
import { statusLabel, type MemberStatus } from "../../lib/members/status";

export function StatusControl({ id, status, version }: { id: string; status: MemberStatus; version: number }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [next, setNext] = useState<MemberStatus | "">("");
  const options: MemberStatus[] = status === "ATIVO" ? ["AFASTADO", "DESLIGADO"]
    : status === "AFASTADO" ? ["ATIVO", "DESLIGADO"] : status === "DESLIGADO" ? ["ATIVO"] : [];
  if (!options.length) return <p className="text-type-body-compact text-nite-text-secondary">O ingresso pendente é concluído por convite autorizado.</p>;
  return <form onSubmit={event => {
    event.preventDefault();
    if (!next || !reason.trim()) { setError("Selecione uma situação e informe o motivo."); return; }
    if (!window.confirm(`Confirmar alteração para ${statusLabel[next]}?`)) return;
    startTransition(async () => {
      const issue = await changeMemberStatus({ id, status: next, version, reason });
      setError(issue);
      if (!issue) { setNext(""); setReason(""); router.refresh(); }
    });
  }} className="grid gap-3 border-t border-nite-border-soft pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
    <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Alterar situação
      <FilterSelect value={next} onChange={event => setNext(event.target.value as MemberStatus | "")}>
        <option value="">Selecione</option>{options.map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}
      </FilterSelect>
    </label>
    <label className="grid gap-1 text-type-metadata text-nite-text-secondary">Motivo
      <input value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required className="min-h-10 rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary" />
    </label>
    <Button size="compact" variant="primary" disabled={pending}>{pending ? "Salvando…" : "Confirmar"}</Button>
    {error && <p role="alert" className="text-type-body-compact text-status-error sm:col-span-3">{error}</p>}
  </form>;
}
