"use client";

import { useState } from "react";
import { Button, Dialog, Field, FilterSelect, TextField, Textarea } from "../ui";
import { isActivityEvidenceFileTooLarge } from "../../lib/activities/limits";

type ActivityFormAction = (formData: FormData) => void | Promise<void>;
type EvidenceInputType = "TEXT" | "TECHNICAL" | "LINK" | "FILE";
type CorrectionOption = { id: string; label: string };

export function ActivityEvidenceDialog({
  addAction,
  uploadAction,
  expectedVersion,
  returnTo,
  corrections,
}: {
  addAction: ActivityFormAction | null;
  uploadAction: ActivityFormAction | null;
  expectedVersion: number;
  returnTo: string;
  corrections: readonly CorrectionOption[];
}) {
  const initialType: EvidenceInputType = addAction ? "TEXT" : "FILE";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EvidenceInputType>(initialType);
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const selectedAction = type === "FILE" ? uploadAction : addAction;
  if (!selectedAction) return null;

  const inputTypes: readonly EvidenceInputType[] = [
    ...(addAction ? ["TEXT", "TECHNICAL", "LINK"] as const : []),
    ...(uploadAction ? ["FILE"] as const : []),
  ];
  const typeLabel: Record<EvidenceInputType, string> = {
    TEXT: "Registro textual",
    TECHNICAL: "Registro técnico",
    LINK: "Referência externa",
    FILE: "Arquivo privado",
  };

  function selectType(value: string): EvidenceInputType {
    return inputTypes.find((option) => option === value) ?? initialType;
  }

  return <>
    <Button size="compact" type="button" variant="secondary" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      Adicionar evidência
    </Button>
    <Dialog open={open} onOpenChange={setOpen} title="Adicionar evidência" description="Escolha o formato e preencha apenas os campos necessários.">
      <form action={selectedAction} className="grid min-w-0 gap-4">
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {type !== "FILE" ? <input type="hidden" name="type" value={type} /> : null}
        {inputTypes.length > 1 ? <Field id="activity-evidence-type" label="Tipo de evidência" required>
          <FilterSelect name="evidenceType" value={type} onChange={(event) => { setType(selectType(event.currentTarget.value)); setFileTooLarge(false); }}>
            {inputTypes.map((option) => <option key={option} value={option}>{typeLabel[option]}</option>)}
          </FilterSelect>
        </Field> : null}
        {type === "TEXT" || type === "TECHNICAL" ? <Field id="activity-evidence-content" label={type === "TEXT" ? "Registro" : "Registro técnico"} required>
          <Textarea name="content" required maxLength={10_000} />
        </Field> : null}
        {type === "LINK" ? <Field id="activity-evidence-url" label="Endereço externo" description="Use um endereço HTTP ou HTTPS." required>
          <TextField name="url" type="url" required maxLength={2_048} placeholder="https://" />
        </Field> : null}
        {type === "FILE" ? <>
          <Field id="activity-evidence-file" label="Arquivo privado" description="TXT, PNG ou JPEG. Até 10 MiB." required>
            <TextField
              name="file"
              type="file"
              required
              accept=".txt,.png,.jpg,.jpeg,text/plain,image/png,image/jpeg"
              aria-invalid={fileTooLarge}
              aria-describedby={fileTooLarge ? "activity-evidence-file-error" : undefined}
              onChange={(event) => setFileTooLarge(Boolean(event.currentTarget.files?.[0] && isActivityEvidenceFileTooLarge(event.currentTarget.files[0])))}
            />
          </Field>
          {fileTooLarge ? <p id="activity-evidence-file-error" role="alert" className="text-type-body-compact text-status-error">O arquivo excede o limite de 10 MiB. Escolha um arquivo menor.</p> : null}
        </> : null}
        {corrections.length ? <Field id="activity-evidence-correction" label="Corrige um registro desta página" optional>
          <FilterSelect name="correctsEvidenceId" defaultValue="">
            <option value="">Não se aplica</option>
            {corrections.map((correction) => <option key={correction.id} value={correction.id}>{correction.label}</option>)}
          </FilterSelect>
        </Field> : null}
        <Field id="activity-evidence-reason" label="Motivo do registro" required>
          <Textarea name="reason" required maxLength={1_000} />
        </Field>
        <div className="flex justify-end">
          <Button size="compact" type="submit" variant="secondary" disabled={type === "FILE" && fileTooLarge}>{type === "FILE" ? "Enviar arquivo" : "Salvar evidência"}</Button>
        </div>
      </form>
    </Dialog>
  </>;
}
