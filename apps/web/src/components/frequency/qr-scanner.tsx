"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Button } from "../ui";
import { confirmFrequencyQr, type FrequencyActionResult } from "../../lib/frequency/actions";
import { tokenFromFrequencyQr } from "../../lib/frequency/qr";
import { cameraStartErrorMessage } from "../../lib/frequency/scanner";

type ScanState = { kind: "idle" | "starting" | "confirming" } | { kind: "error"; message: string } | { kind: "result"; result: FrequencyActionResult };

export function QrScanner({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [state, setState] = useState<ScanState>({ kind: "starting" });
  const [pending, setPending] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    if (!window.isSecureContext) {
      window.setTimeout(() => { if (!disposed) setState({ kind: "error", message: "A câmera exige uma conexão segura (HTTPS)." }); }, 0);
      return;
    }
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
    void reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, videoRef.current ?? undefined, (result, error, controls) => {
      if (disposed) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      if (result) {
        controls.stop();
        controlsRef.current = null;
        const token = tokenFromFrequencyQr(result.getText(), window.location.origin);
        if (!token) {
          setState({ kind: "error", message: "Este QR não é válido para a confirmação de Frequência deste NITE Connect." });
          return;
        }
        setState({ kind: "confirming" });
        setPending(true);
        void confirmFrequencyQr(token).then((confirmation) => setState({ kind: "result", result: confirmation })).finally(() => setPending(false));
      } else if (error && error.name !== "NotFoundException" && error.name !== "ChecksumException" && error.name !== "FormatException") {
        controls.stop();
        controlsRef.current = null;
        setState({ kind: "error", message: "Não foi possível ler o código com esta câmera." });
      }
    }).then((controls) => {
      controlsRef.current = controls;
      if (!disposed) setState((current) => current.kind === "starting" ? { kind: "idle" } : current);
      else controls.stop();
    }).catch((error: unknown) => {
      if (disposed) return;
      const name = error instanceof DOMException ? error.name : "";
      setState({ kind: "error", message: cameraStartErrorMessage(name) });
    });
    return () => {
      disposed = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  const close = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    onClose();
  };

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-3 sm:p-6" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="frequency-scanner-title" className="grid max-h-[calc(100dvh-1.5rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-dialog border border-nite-border-soft bg-nite-background p-4 shadow-nite-modal sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-type-metadata font-medium uppercase tracking-[0.12em] text-nite-brand-accent">Confirmação individual</p><h2 id="frequency-scanner-title" className="mt-1 font-display text-type-section-title text-nite-text-primary">Escanear QR Code</h2><p className="mt-2 text-type-body-compact text-nite-text-secondary">Centralize o código na moldura. A confirmação será solicitada à API após a leitura.</p></div>
        <button ref={closeButtonRef} type="button" aria-label="Fechar leitor de QR Code" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-control border border-nite-border-soft text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">×</button>
      </header>
      {state.kind !== "result" ? <div className="relative aspect-square w-full overflow-hidden rounded-panel bg-black">
        <video ref={videoRef} aria-label="Prévia da câmera para leitura do QR Code" autoPlay playsInline muted className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[13%] rounded-panel border-2 border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,.28)]" />
        {state.kind === "starting" || state.kind === "confirming" ? <div className="absolute inset-0 grid place-items-center bg-black/55 px-6 text-center text-type-body-compact text-white">{state.kind === "confirming" ? "Validando sua confirmação…" : "Preparando a câmera…"}</div> : null}
      </div> : null}
      {state.kind === "error" ? <p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-3 py-2.5 text-type-body-compact text-status-error">{state.message}</p> : null}
      {state.kind === "result" ? state.result.kind === "success" ? <div role="status" className="rounded-panel border border-status-done-border bg-status-done-soft p-4 text-status-done"><p className="font-semibold">{state.result.confirmation.alreadyRegistered ? "Presença já confirmada" : "Presença confirmada"}</p><p className="mt-1 text-type-body-compact">Registro recebido às {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }).format(new Date(state.result.confirmation.confirmedAt))}.</p></div> : <p role="alert" className="rounded-control border border-status-error-border bg-status-error-soft px-3 py-2.5 text-type-body-compact text-status-error">{state.result.message}</p> : null}
      {pending ? <p role="status" className="text-type-metadata text-nite-text-muted">Aguardando confirmação segura do servidor…</p> : null}
      <footer className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>{state.kind === "result" ? "Concluir" : "Fechar leitor"}</Button></footer>
    </section>
  </div>;
}
