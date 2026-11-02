import Image from "next/image";

export function ProjectorPreview({ svg }: { svg: string }) {
  return <main className="min-h-svh bg-[#06111f] pt-14 text-white">
    <div className="mx-auto grid min-h-[calc(100svh-3.5rem)] w-full max-w-[1600px] grid-rows-[auto_1fr] px-5 py-5 sm:px-8 sm:py-7 lg:px-12 lg:py-8">
      <header className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-sky-300 text-sm font-black tracking-tight text-[#06111f]">N</span>
        <span className="text-type-body-compact font-semibold tracking-wide text-white">NITE Connect</span>
      </header>
      <section aria-labelledby="projector-preview-title" className="flex flex-col items-center justify-center gap-3 py-7 text-center sm:gap-4 sm:py-9">
        <h1 id="projector-preview-title" className="max-w-5xl break-words font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">Encontro semanal do NITE</h1>
        <p className="max-w-xl text-lg leading-relaxed text-slate-200 sm:text-xl">Escaneie o QR Code para confirmar sua presença.</p>
        <div className="mt-1 grid justify-items-center">
          <div className="grid aspect-square w-[min(82vw,34rem)] place-items-center bg-white p-[clamp(1rem,3vw,1.75rem)] shadow-[0_32px_100px_rgba(0,0,0,.5)]">
            <Image unoptimized width={768} height={768} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt="QR Code sintético para revisão visual" className="h-full w-full" />
          </div>
        </div>
        <div aria-label="Prévia sintética, janela de 5 minutos" className="grid justify-items-center gap-0.5 pt-1">
          <span className="text-type-body-compact font-medium text-slate-200">Tempo restante</span>
          <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-white sm:text-5xl lg:text-6xl">03:42</span>
        </div>
        <p role="status" className="pt-1 text-type-body-compact font-semibold text-amber-200">Prévia sintética · QR sem validade na API</p>
      </section>
    </div>
  </main>;
}
