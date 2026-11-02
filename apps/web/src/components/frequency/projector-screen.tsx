"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { pollFrequencyProjector, renewFrequencyQr, type ProjectorQrResult } from "../../lib/frequency/actions";

type ProjectorList = { listId: string; meetingName: string; status: string; openedAt: string; confirmationDeadline: string; version: number; qr: { version: number; expiresAt: string } | null };

function remainingLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ProjectorScreen({ initialList, initialSvg, initialQrExpiresAt }: { initialList: ProjectorList; initialSvg: string | null; initialQrExpiresAt: string | null }) {
  const [list, setList] = useState(initialList);
  const [svg, setSvg] = useState(initialSvg);
  const [qrExpiresAt, setQrExpiresAt] = useState(initialQrExpiresAt);
  const [clock, setClock] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [rotationNotice, setRotationNotice] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const renewalInFlight = useRef(false);
  const globalRemaining = clock ? Math.max(0, Date.parse(list.confirmationDeadline) - clock) : null;
  const qrRemaining = clock && qrExpiresAt ? Math.max(0, Date.parse(qrExpiresAt) - clock) : null;
  const windowDuration = Math.max(1, Date.parse(list.confirmationDeadline) - Date.parse(list.openedAt));

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(Date.now()), 0);
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  useEffect(() => {
    if (list.status !== "ABERTA") return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void pollFrequencyProjector(list.listId, list.version).then((snapshot) => {
        if (stopped) return;
        if (!snapshot.ok) {
          setMessage(snapshot.message);
          return;
        }
        const qrChanged = snapshot.list.qr?.version !== list.qr?.version;
        setList(snapshot.list);
        setMessage(null);
        if (qrChanged) {
          setSvg(null);
          setQrExpiresAt(null);
          setRotationNotice(true);
          window.setTimeout(() => setRotationNotice(false), 4_000);
        }
      });
    }, 4_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [list.listId, list.status, list.version, list.qr?.version]);

  useEffect(() => {
    if (list.status !== "ABERTA") return;
    let active = true;
    const renewIfNeeded = async () => {
      if (renewalInFlight.current || Date.parse(list.confirmationDeadline) <= Date.now()) return;
      if (qrExpiresAt && Date.parse(qrExpiresAt) - Date.now() > 8_000) return;
      renewalInFlight.current = true;
      setMessage(null);
      try {
        const result: ProjectorQrResult = await renewFrequencyQr(list.listId, list.version);
        if (!active) return;
        if (!result.ok) {
          setSvg(null);
          setMessage(result.message);
          return;
        }
        setSvg(result.svg);
        setQrExpiresAt(result.expiresAt);
        setList((current) => ({ ...current, version: result.version, qr: { version: result.version, expiresAt: result.expiresAt } }));
        setRotationNotice(true);
        window.setTimeout(() => setRotationNotice(false), 4_000);
      } finally {
        renewalInFlight.current = false;
      }
    };
    const timer = window.setInterval(() => { void renewIfNeeded(); }, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [list.confirmationDeadline, list.listId, list.status, list.version, qrExpiresAt]);

  const expired = globalRemaining !== null && globalRemaining <= 0;
  const canceled = list.status === "CANCELADA";
  const completed = list.status === "CONCLUIDA";
  const closed = canceled || completed;
  const qrUsable = !closed && !expired && qrRemaining !== 0 && Boolean(svg);
  const presentationState = canceled
    ? "Lista cancelada"
    : completed
      ? "Lista concluída"
      : expired
        ? "Janela de confirmação encerrada"
        : qrUsable && message
          ? "Falha temporária · QR vigente"
        : qrUsable && rotationNotice
          ? "QR renovado"
          : qrUsable
            ? "Apresentação ativa"
            : message
              ? "Falha temporária · tentando recuperar o QR"
              : qrRemaining === 0
                ? "QR expirado · atualizando"
                : "Preparando QR Code";

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setMessage("Não foi possível ativar a tela cheia neste navegador.");
    }
  }

  return <main className="min-h-svh bg-[#06111f] text-white">
    <div className="mx-auto grid min-h-svh w-full max-w-[1600px] grid-rows-[auto_1fr] px-5 py-5 sm:px-8 sm:py-7 lg:px-12 lg:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div aria-label="NITE Connect" className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-sky-300 text-sm font-black tracking-tight text-[#06111f]">N</span>
          <span className="text-type-body-compact font-semibold tracking-wide text-white">NITE Connect</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/frequencia?view=management&mode=meeting&list=${encodeURIComponent(list.listId)}`} className="inline-flex min-h-11 items-center rounded-control px-3 text-type-metadata font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Voltar à gestão</Link>
          <button type="button" onClick={() => void toggleFullscreen()} className="inline-flex min-h-11 items-center rounded-control border border-white/15 px-3 text-type-metadata font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-300">{fullscreen ? "Sair da tela cheia" : "Tela cheia"}</button>
        </div>
      </header>

      <section aria-labelledby="projector-meeting-title" className="grid min-h-0 items-center gap-7 py-6 sm:gap-10 sm:py-8 lg:grid-cols-[minmax(20rem,.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div className="order-2 grid content-center gap-6 text-center lg:order-1 lg:text-left">
          <div>
            <p className="text-type-metadata font-semibold uppercase tracking-[0.18em] text-sky-300">Confirmação de presença</p>
            <h1 id="projector-meeting-title" className="mt-3 break-words font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">{list.meetingName}</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-300 sm:text-xl">Escaneie o QR Code e confirme sua presença no seu dispositivo.</p>
          </div>

          <div className="mx-auto grid w-full max-w-md gap-3 border-y border-white/15 py-4 text-left lg:mx-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-type-body-compact text-slate-300">Janela total · {windowDuration / 60_000} minutos</span>
              <span aria-label={globalRemaining === null ? "Tempo restante indisponível" : `Tempo restante ${remainingLabel(globalRemaining)}`} className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-white sm:text-5xl">{globalRemaining === null ? "--:--" : remainingLabel(globalRemaining)}</span>
            </div>
            <p role="status" aria-live="polite" className="text-type-body-compact font-medium text-sky-200">{presentationState}</p>
            {message ? <p className="text-type-metadata text-amber-200">{message}</p> : null}
          </div>
        </div>

        <div className="order-1 grid justify-items-center gap-4 lg:order-2">
          <div className="grid aspect-square w-[min(82vw,42rem)] place-items-center bg-white p-[clamp(1.25rem,4vw,2.25rem)] shadow-[0_32px_100px_rgba(0,0,0,.5)]">
            {qrUsable && svg ? <Image unoptimized width={768} height={768} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt="QR Code temporário para confirmação de presença" className="h-full w-full" /> : <div className="grid h-full w-full place-items-center border-2 border-dashed border-slate-300 px-6 text-center text-lg font-medium text-slate-600">{canceled ? "Lista cancelada" : completed ? "Lista concluída" : expired ? "Janela encerrada" : message ? "QR temporariamente indisponível" : "QR sendo preparado"}</div>}
          </div>
        </div>
      </section>
    </div>
  </main>;
}
