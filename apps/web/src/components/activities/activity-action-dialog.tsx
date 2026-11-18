"use client";

import { useState, type ReactNode } from "react";
import type { ActivityStatus } from "../../lib/activities/contracts";
import { activityStatuses } from "../../lib/activities/contracts";
import { Button, Checkbox, Dialog, Field, Select, Textarea } from "../ui";
import { activityStatusLabel } from "./activity-list";

type ActivityFormAction = (formData: FormData) => void | Promise<void>;

function isTerminalStatus(status: ActivityStatus): boolean {
  return status === "CONCLUIDA" || status === "CANCELADA";
}

export function requiresTransitionConfirmation(current: ActivityStatus, next: ActivityStatus | ""): boolean {
  return next !== "" && (next === "CANCELADA" || isTerminalStatus(current));
}

export function ActivityActionDialog({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return <>
    <Button type="button" variant="quiet" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="justify-start px-3">
      {label}
    </Button>
    <Dialog open={open} onOpenChange={setOpen} title={title} description={description}>
      {children}
    </Dialog>
  </>;
}

export function ActivityStatusDialog({
  action,
  current,
  transitions,
  expectedVersion,
  returnTo,
}: {
  action: ActivityFormAction;
  current: ActivityStatus;
  transitions: readonly ActivityStatus[];
  expectedVersion: number;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<ActivityStatus | "">("");
  const confirmationRequired = requiresTransitionConfirmation(current, nextStatus);
  const confirmationLabel = nextStatus === "CANCELADA"
    ? "Confirmo o cancelamento da atividade."
    : "Confirmo a reabertura da atividade.";

  function selectStatus(value: string): ActivityStatus | "" {
    return activityStatuses.find((status) => status === value && transitions.includes(status)) ?? "";
  }

  return <>
    <Button type="button" variant="quiet" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="justify-start px-3">
      Alterar situação
    </Button>
    <Dialog open={open} onOpenChange={setOpen} title="Alterar situação" description="A mudança será registrada no histórico da atividade.">
      <form action={action} className="grid min-w-0 gap-4">
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field id="activity-next-status" label="Nova situação" required>
          <Select
            name="status"
            value={nextStatus}
            placeholder="Selecione uma situação"
            onChange={(event) => setNextStatus(selectStatus(event.currentTarget.value))}
          >
            {transitions.map((status) => <option key={status} value={status}>{activityStatusLabel[status]}</option>)}
          </Select>
        </Field>
        <Field id="activity-status-reason" label="Motivo (opcional)">
          <Textarea name="reason" maxLength={1_000} />
        </Field>
        {confirmationRequired ? <Field id="activity-status-confirmation" layout="checkbox" label={confirmationLabel} required>
          <Checkbox name="confirmed" value="true" required />
        </Field> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary">Atualizar situação</Button>
        </div>
      </form>
    </Dialog>
  </>;
}
