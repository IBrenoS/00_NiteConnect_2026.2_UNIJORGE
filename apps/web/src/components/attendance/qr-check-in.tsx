"use client";

import { TransientFeedback } from "../ui/transient-feedback";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Dialog, Button } from "../ui";
import { registerAttendance, type AttendanceActionState } from "../../lib/attendance/actions";

type Props = { intent: "check-in" | "return"; targetId: string; expectedVersion?: number; label?: string };

export function QrCheckIn({ intent, targetId, expectedVersion, label }: Props) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!open || !scanning || !video.current) return;
    let active = true;
    let stop: (() => void) | undefined;
    attempted.current = false;
    setMessage("Aponte a câmera para o QR temporário exibido no encontro.");
    void import("@zxing/browser").then(async ({ BrowserQRCodeReader }) => {
      if (!active || !video.current) return;
      const reader = new BrowserQRCodeReader();
      try {
        const controls = await reader.decodeFromVideoDevice(undefined, video.current, (result, _error, currentControls) => {
          if (!result || attempted.current) return;
          attempted.current = true;
          currentControls.stop();
          stop = () => currentControls.stop();
          if (!active) return;
          setScanning(false);
          setPayload(result.getText());
          setMessage("QR capturado. Confirme para enviar a sessão ao servidor.");
        });
        stop = () => controls.stop();
        if (!active) controls.stop();
      } catch {
        if (active) {
          setScanning(false);
          setMessage("Não foi possível acessar a câmera. Verifique a permissão do navegador e use uma conexão segura para escanear o QR.");
        }
      }
    }).catch(() => {
      if (active) {
        setScanning(false);
        setMessage("O leitor de QR não ficou disponível neste navegador.");
      }
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [open, scanning]);

  function close(next: boolean) {
    if (!next) { setScanning(false); setPayload(""); }
    setOpen(next);
  }

  return <>
    <Button type="button" variant="secondary" onClick={() => { setMessage(""); setPayload(""); setOpen(true); }} aria-haspopup="dialog">
      {label ?? (intent === "check-in" ? "Ler QR do encontro" : "Ler QR para retorno")}
    </Button>
    <Dialog open={open} onOpenChange={close} title="Confirmar presença" description="Escaneie o QR temporário que está sendo exibido no encontro. O servidor confirma se a sessão continua válida.">
      <div className="grid min-w-0 gap-4">
        <div className="overflow-hidden rounded-panel border border-nite-border-soft bg-nite-section">
          <video ref={video} className="aspect-video w-full object-cover" muted playsInline aria-label="Prévia da câmera para leitura do QR" />
        </div>
        <p className="text-type-body-compact text-nite-text-secondary" role="status" aria-live="polite">{message || "A câmera só será ativada quando você iniciar a leitura."}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {scanning ? <Button type="button" variant="secondary" onClick={() => setScanning(false)}>Parar leitura</Button> : null}
          {!scanning && !payload ? <Button type="button" onClick={() => setScanning(true)}>Iniciar câmera</Button> : null}
          {payload ? <QrAttendanceForm key={payload} intent={intent} targetId={targetId} expectedVersion={expectedVersion} payload={payload} /> : null}
        </div>
      </div>
    </Dialog>
  </>;
}

function QrAttendanceForm({ intent, targetId, expectedVersion, payload }: Props & { payload: string }) {
  const [result, action] = useActionState(registerAttendance, { status: "idle" } satisfies AttendanceActionState);
  const router = useRouter();

  useEffect(() => {
    if (result.status === "success") router.refresh();
  }, [result.status, router]);

  return <>
    {result.status === "success" ? null : <form action={action} className="contents">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name={intent === "check-in" ? "eventId" : "attendanceId"} value={targetId} />
      <input type="hidden" name="payload" value={payload} />
      {expectedVersion !== undefined ? <input type="hidden" name="expectedVersion" value={expectedVersion} /> : null}
      <QrSubmitButton />
    </form>}
    {result.message ? <TransientFeedback messageKey={`${result.status}:${result.message}`} occurrenceKey={result}><p role="status" className="w-full text-right text-type-metadata text-nite-text-secondary">{result.message}</p></TransientFeedback> : null}
  </>;
}

function QrSubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending}>Confirmar registro</Button>;
}
