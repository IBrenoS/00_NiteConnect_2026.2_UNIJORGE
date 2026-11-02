import Image from "next/image";

export function ProjectorPreview({ svg }: { svg: string }) {
  return <main className="min-h-svh bg-[#06111f] pt-14 text-white">
    <div className="mx-auto grid min-h-[calc(100svh-3.5rem)] w-full max-w-[1600px] grid-rows-[auto_1fr] px-5 py-5 sm:px-8 sm:py-7 lg:px-12 lg:py-8">
      <header className="flex items-center gap-3 border-b border-white/10 pb-4">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-sky-300 text-sm font-black tracking-tight text-[#06111f]">N</span>
        <span className="text-type-body-compact font-semibold tracking-wide text-white">NITE Connect</span>
      </header>
      <section aria-labelledby="projector-preview-title" className="grid items-center gap-7 py-6 sm:gap-10 sm:py-8 lg:grid-cols-[minmax(20rem,.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <div className="order-2 grid content-center gap-6 text-center lg:order-1 lg:text-left">
          <div>
            <p className="text-type-metadata font-semibold uppercase tracking-[0.18em] text-sky-300">Confirmação de presença</p>
            <h1 id="projector-preview-title" className="mt-3 break-words font-display text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">Encontro semanal do NITE</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-300 sm:text-xl">Escaneie o QR Code e confirme sua presença no seu dispositivo.</p>
          </div>
          <div className="mx-auto grid w-full max-w-md gap-3 border-y border-white/15 py-4 text-left lg:mx-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><span className="text-type-body-compact text-slate-300">Janela total · 5 minutos</span><span className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-white sm:text-5xl">03:42</span></div>
            <p role="status" className="text-type-body-compact font-medium text-amber-200">Prévia sintética · QR sem validade na API</p>
          </div>
        </div>
        <div className="order-1 grid justify-items-center lg:order-2">
          <div className="grid aspect-square w-[min(82vw,42rem)] place-items-center bg-white p-[clamp(1.25rem,4vw,2.25rem)] shadow-[0_32px_100px_rgba(0,0,0,.5)]">
            <Image unoptimized width={768} height={768} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt="QR Code sintético para revisão visual" className="h-full w-full" />
          </div>
        </div>
      </section>
    </div>
  </main>;
}
