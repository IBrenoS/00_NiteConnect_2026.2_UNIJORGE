"use client";

import { FilterSelect } from "../ui";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button } from "../ui";
import { DialogFrame } from "../ui/dialog-frame";
import { roleLabel } from "../../lib/members/status";
import type { Invitation } from "../../lib/access-management/data";
import { createInvitation, resendInvitation, revokeInvitation, changeInstitutionalRole, getRoleDetails } from "../../lib/access-management/actions";

const roles = ["INTEGRANTE", "GESTOR_PROJETO", "GESTOR_GERAL", "COORDENADOR"] as const;
type Role = typeof roles[number];
type RoleDetails = NonNullable<Awaited<ReturnType<typeof getRoleDetails>>>;
const field = "min-h-10 w-full rounded-control border border-nite-border-control bg-nite-surface px-3 text-nite-text-primary";

export function InvitationControls({ invitation, active = false }: { invitation?: Invitation; active?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [role, setRole] = useState<Role>("INTEGRANTE"), [message, setMessage] = useState(""), [reason, setReason] = useState("");
  async function create() {
    setBusy(true);
    const outcome = await createInvitation({ name, email, role, message });
    setBusy(false); setFeedback(outcome.message);
    if (outcome.ok) { setOpen(false); setName(""); setEmail(""); setMessage(""); router.refresh(); }
  }
  async function resend() {
    if (!invitation) return;
    setBusy(true); const outcome = await resendInvitation(invitation.id); setBusy(false); setFeedback(outcome.message);
    if (outcome.ok) router.refresh();
  }
  async function revoke() {
    if (!invitation) return;
    setBusy(true); const outcome = await revokeInvitation(invitation.id, reason); setBusy(false); setFeedback(outcome.message);
    if (outcome.ok) { setConfirm(false); router.refresh(); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    {invitation ? <>{active && (invitation.sendState === "FAILED" || invitation.sendState === "NOT_SENT") ? <Button size="compact" type="button" variant="secondary" disabled={busy} onClick={() => void resend()}>Reenviar</Button> : null}
      {!invitation.acceptedAt && !invitation.revokedAt ? <Button size="compact" type="button" variant="destructive" disabled={busy} onClick={() => setConfirm(true)}>Revogar</Button> : null}</>
      : <Button size="compact" type="button" onClick={() => setOpen(true)}>Novo convite</Button>}
    {feedback && <span role="status" className="max-w-72 text-type-metadata text-nite-text-secondary">{feedback}</span>}
    <DialogFrame open={open} onOpenChange={setOpen} title="Novo convite" description="O destinatário receberá um link para entrar com o e-mail institucional. A validade é de sete dias."
      footer={<><Button size="compact" type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button size="compact" type="button" loading={busy} onClick={() => void create()}>Criar e enviar</Button></>}>
      <div className="grid gap-4"><label className="grid gap-1 text-type-metadata">Nome<input className={field} value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
        <label className="grid gap-1 text-type-metadata">E-mail institucional<input className={field} type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /></label>
        <label className="grid gap-1 text-type-metadata">Papel inicial<FilterSelect value={role} onChange={event => setRole(event.target.value as Role)}>{roles.map(value => <option key={value} value={value}>{roleLabel[value]}</option>)}</FilterSelect></label>
        <label className="grid gap-1 text-type-metadata">Mensagem opcional<textarea className={field} value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} rows={3} /></label>
        {feedback && <p role="status" className="text-type-metadata">{feedback}</p>}</div>
    </DialogFrame>
    <AlertDialog open={confirm} onOpenChange={setConfirm} title="Revogar convite" description={`O convite de ${invitation?.name ?? ""} deixará de permitir ingresso.`} confirmLabel="Revogar convite" pending={busy} onConfirm={() => void revoke()}>
      <label className="grid gap-1 text-type-metadata">Motivo opcional<textarea className={field} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={3} /></label>
    </AlertDialog>
  </div>;
}

export function RoleControls({ memberId, name }: { memberId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [details, setDetails] = useState<RoleDetails | null>(null);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const [operation, setOperation] = useState<"grant" | "revoke">("grant"), [role, setRole] = useState<Exclude<Role, "INTEGRANTE">>("GESTOR_PROJETO"), [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function show() { setOpen(true); setBusy(true); setFeedback(""); const result = await getRoleDetails(memberId); setDetails(result); setBusy(false); if (!result) setFeedback("Não foi possível carregar as permissões."); }
  async function change() {
    if (!details) return;
    setBusy(true); const result = await changeInstitutionalRole({ memberId, role, operation, reason, version: details.detail.version });
    setBusy(false); setFeedback(result.message); setConfirm(false);
    if (result.ok) { const refreshed = await getRoleDetails(memberId); setDetails(refreshed); setReason(""); router.refresh(); }
  }
  return <><Button size="compact" type="button" variant="secondary" onClick={() => void show()}>Gerenciar papéis</Button>
    <DialogFrame open={open} onOpenChange={setOpen} title={`Permissões de ${name}`} description="GESTOR_PROJETO permite liderança elegível; a administração global exige GESTOR_GERAL ou COORDENADOR."
      footer={<Button size="compact" type="button" variant="secondary" onClick={() => setOpen(false)}>Fechar</Button>}>
      {busy && !details ? <p>Carregando…</p> : null}{feedback && <p role="status" className="text-type-body-compact text-nite-text-secondary">{feedback}</p>}
      {details && <div className="grid gap-5"><p className="text-type-body-compact">Papéis vigentes: {details.detail.roles.map(item => roleLabel[item] ?? item).join(", ")}</p>
        <div className="grid gap-3 border-t border-nite-border-soft pt-4"><label className="grid gap-1 text-type-metadata">Operação<FilterSelect value={operation} onChange={event => setOperation(event.target.value as "grant" | "revoke")}><option value="grant">Conceder</option><option value="revoke">Revogar</option></FilterSelect></label>
          <label className="grid gap-1 text-type-metadata">Papel<FilterSelect value={role} onChange={event => setRole(event.target.value as Exclude<Role, "INTEGRANTE">)}>{(["GESTOR_PROJETO", "GESTOR_GERAL", "COORDENADOR"] as const).map(value => <option key={value} value={value}>{roleLabel[value]}</option>)}</FilterSelect></label>
          <label className="grid gap-1 text-type-metadata">Motivo opcional<textarea className={field} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={2} /></label>
          <Button size="compact" type="button" variant={operation === "revoke" ? "destructive" : "primary"} disabled={busy || (operation === "grant" ? details.detail.roles.includes(role) : !details.detail.roles.includes(role))} onClick={() => setConfirm(true)}>{operation === "grant" ? "Conceder papel" : "Revogar papel"}</Button></div>
        <section className="border-t border-nite-border-soft pt-4"><h3 className="font-semibold">Histórico institucional</h3>{details.historyUnavailable ? <p role="alert">Não foi possível consultar o histórico.</p> : details.history.length ? <ul className="mt-2 divide-y divide-nite-border-soft">{details.history.map(event => <li key={event.id} className="py-2 text-type-metadata"><span className="font-medium">{event.kind === "ROLE_GRANTED" ? "Concessão" : event.kind === "ROLE_REVOKED" ? "Revogação" : "Situação"}</span> · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(event.occurredAt))} · {event.actorName ?? "Registro técnico"}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ul> : <p className="mt-2 text-type-metadata">Sem eventos registrados.</p>}</section></div>}
    </DialogFrame>
    <AlertDialog open={confirm} onOpenChange={setConfirm} title={`${operation === "grant" ? "Conceder" : "Revogar"} ${roleLabel[role]}`} description={`Confirme a alteração de papel institucional de ${name}.`} confirmLabel="Confirmar alteração" pending={busy} onConfirm={() => void change()} />
  </>;
}
