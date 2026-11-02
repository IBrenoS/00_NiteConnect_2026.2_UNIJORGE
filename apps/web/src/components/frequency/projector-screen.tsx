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
  const renewalInFlight = useRef(false);
  const globalRemaining = clock ? Math.max(0, Date.parse(list.confirmationDeadline) - clock) : null;
  const qrRemaining = clock && qrExpiresAt ? Math.max(0, Date.parse(qrExpiresAt) - clock) : null;
  const windowDuration = Math.max(1, Date.parse(list.confirmationDeadline) - Date.parse(list.openedAt));

  useEffect(() => {
    const initial = window.setTimeout(() => setClock(Date.now()), 0);
    const interval = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
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
        setList(snapshot.list);
        const qrChanged = snapshot.list.qr?.version !== list.qr?.version;
        if (qrChanged) {
          setSvg(null);
          setQrExpiresAt(null);
          setRotationNotice(true);
          setMessage("O QR foi renovado em outra tela. Aguardando uma nova emissão para esta projeção…");
        }
      });
    }, 4_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [list.listId, list.status, list.version, list.qr?.version, qrExpiresAt]);

  useEffect(() => {
    if (list.status !== "ABERTA" || rotationNotice) return;
    let active = true;
    const renewIfNeeded = async () => {
      if (renewalInFlight.current || Date.parse(list.confirmationDeadline) <= Date.now()) return;
      if (qrExpiresAt && Date.parse(qrExpiresAt) - Date.now() > 8_000) return;
      renewalInFlight.current = true;
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
        setRotationNotice(false);
        setMessage(null);
      } finally {
        renewalInFlight.current = false;
      }
    };
    const timer = window.setInterval(() => { void renewIfNeeded(); }, 1_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [list.confirmationDeadline, list.listId, list.status, list.version, qrExpiresAt, rotationNotice]);

  const expired = globalRemaining !== null && globalRemaining <= 0;
  const closed = list.status !== "ABERTA";

  return <main className="grid min-h-svh place-items-center bg-[#07101d] px-4 py-7 text-white sm:px-8">
    <section className="grid w-full max-w-5xl gap-6 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.82fr)] lg:items-center">
      <div className="order-2 grid content-center gap-6 text-center lg:order-1 lg:text-left">
        <div><p className="text-type-metadata font-medium uppercase tracking-[0.22em] text-sky-300">NITE Connect · Frequência</p><h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl" style={{ color: "white" }}>{list.meetingName}</h1><p className="mt-3 text-type-body-compact text-slate-300 sm:text-base">Aponte a câmera para confirmar sua própria presença.</p></div>
        <div className="mx-auto grid w-full max-w-sm gap-2 rounded-panel border border-white/10 bg-white/[0.04] p-4 text-left lg:mx-0">
          <div className="flex items-center justify-between gap-4"><span className="text-type-metadata text-slate-300">Janela de confirmação</span><span className={`font-mono text-xl font-semibold tabular-nums ${expired ? "text-slate-400" : globalRemaining !== null && globalRemaining < 30_000 ? "text-amber-300" : "text-white"}`}>{globalRemaining === null ? "--:--" : remainingLabel(globalRemaining)}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-400 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${globalRemaining === null ? 0 : Math.min(100, Math.max(0, (globalRemaining / windowDuration) * 100))}%` }} /></div>
          <p className="text-type-metadata text-slate-400">{expired ? "A janela terminou. A gestão ainda precisa concluir a lista." : "A lista não será concluída automaticamente ao fim da janela."}</p>
        </div>
        <ol className="mx-auto grid max-w-sm gap-2 text-left text-type-body-compact text-slate-300 lg:mx-0">
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-type-metadata text-sky-200">1</span><span>Abra a câmera do celular ou o leitor dentro do NITE Connect.</span></li>
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-type-metadata text-sky-200">2</span><span>Entre com sua conta institucional, se solicitado.</span></li>
          <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-type-metadata text-sky-200">3</span><span>Confirme a presença na tela do seu aparelho.</span></li>
        </ol>
      </div>
      <div className="order-1 grid justify-items-center gap-4 lg:order-2">
        <div className="grid aspect-square w-[min(76vw,25rem)] place-items-center rounded-[1.75rem] bg-white p-[clamp(1.1rem,5vw,2rem)] shadow-[0_24px_90px_rgba(0,0,0,.45)]">
          {!closed && !expired && svg ? <Image unoptimized width={512} height={512} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt="QR Code temporário da lista de Frequência" className="h-full w-full" /> : <div className="grid h-full w-full place-items-center rounded-panel border border-dashed border-slate-300 px-6 text-center text-sm text-slate-500">{closed ? "Lista encerrada" : expired ? "Confirmações encerradas" : qrRemaining === null || qrRemaining <= 0 ? "Atualizando QR…" : "QR indisponível"}</div>}
        </div>
        <p className="text-type-metadata text-slate-400">O código é temporário e muda automaticamente.</p>
        {message ? <p role="status" className="max-w-sm text-center text-type-metadata text-amber-200">{message}</p> : null}
        {closed || expired || rotationNotice ? <Link href={`/frequencia?view=management&mode=meeting&list=${encodeURIComponent(list.listId)}`} className="inline-flex min-h-11 items-center rounded-control border border-white/20 px-4 text-type-body-compact text-white hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Voltar à gestão</Link> : null}
      </div>
    </section>
  </main>;
}
