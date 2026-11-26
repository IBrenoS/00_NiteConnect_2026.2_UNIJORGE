"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthenticatedNavigation, buildAuthenticatedNavigationGroups } from "../shell/authenticated-navigation";
import { ThemeControl } from "../theme-control";
import styles from "../projects/project-administration-layout.module.css";

export type PreviewScenario = "manager" | "member" | "empty";
const PreviewScenarioContext = createContext<readonly [PreviewScenario, (scenario: PreviewScenario) => void] | null>(null);
const previewNavigation = buildAuthenticatedNavigationGroups({ projects: [], canAdminister: true, canCoordinate: false });

export function usePreviewScenario(): [PreviewScenario, (scenario: PreviewScenario) => void] {
  const value = useContext(PreviewScenarioContext);
  if (!value) throw new Error("usePreviewScenario deve ser usado dentro da prévia administrativa.");
  return [value[0], value[1]];
}

export function ProjectAdministrationPreviewShell({ children }: Readonly<{ children: ReactNode }>) {
  const [scenario, setScenario] = useState<PreviewScenario>("manager");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const pathname = usePathname();
  const closeMobileNavigation = () => setMobileNavigationOpen(false);
  return <div className="min-h-svh bg-nite-background text-nite-text-primary">
    <a href="#preview-content" className="sr-only z-50 rounded-control bg-nite-surface px-3 py-2 text-nite-text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:outline-3 focus:outline-nite-focus">Ir para o conteúdo principal</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-nite-border-soft bg-nite-background md:flex" aria-label="NITE Connect">
      <div className="flex h-16 shrink-0 items-center px-4"><Link href="/dev/project-administration-preview" className="flex min-w-0 items-center gap-3 rounded-control focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus"><span className="grid size-8 shrink-0 place-items-center rounded-control bg-nite-brand-primary font-display text-type-label font-semibold text-nite-action-text">N</span><span className="truncate font-display text-type-label font-semibold leading-tight text-nite-text-primary">NITE Connect</span></Link></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3"><AuthenticatedNavigation groups={previewNavigation} currentPath="/projetos"/></div>
    </aside>
    {mobileNavigationOpen ? <div className="fixed inset-0 z-50 md:hidden"><button type="button" aria-label="Fechar navegação" className="absolute inset-0 bg-black/45" onClick={closeMobileNavigation}/><aside className="relative flex h-full w-[min(19rem,calc(100vw-2.75rem))] flex-col border-r border-nite-border-soft bg-nite-background shadow-nite-modal" aria-label="Navegação principal"><div className="flex h-16 shrink-0 items-center px-4"><Link href="/dev/project-administration-preview" onClick={closeMobileNavigation} className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-control bg-nite-brand-primary font-display text-type-label font-semibold text-nite-action-text">N</span><span className="truncate font-display text-type-label font-semibold text-nite-text-primary">NITE Connect</span></Link><button type="button" className="ml-auto grid size-11 place-items-center rounded-control border border-nite-border-soft text-nite-text-muted" aria-label="Fechar navegação" onClick={closeMobileNavigation}>×</button></div><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3"><AuthenticatedNavigation groups={previewNavigation} onNavigate={closeMobileNavigation} currentPath="/projetos"/></div></aside></div> : null}
    <div className="min-w-0 md:pl-64">
      <header className={`${styles.shellHeader} sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-nite-border-soft bg-nite-background/95 px-3 backdrop-blur sm:px-5 lg:px-7`}>
        <button type="button" aria-label="Abrir navegação" aria-expanded={mobileNavigationOpen} className={`${styles.mobileMenuButton} grid size-11 shrink-0 place-items-center rounded-control border border-nite-border-soft text-nite-text-secondary md:hidden`} onClick={() => setMobileNavigationOpen(true)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-[18px]"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        <div className={`${styles.headerBreadcrumbs} min-w-0 flex-1`}>{pathname?.includes("/equipe") || pathname?.includes("/configuracoes") ? <nav className="flex items-center gap-2 text-type-body-compact text-nite-text-secondary" aria-label="Navegação estrutural"><Link href="/projetos" className="hover:text-nite-text-primary">Projetos</Link><span aria-hidden="true">/</span><Link href="/dev/project-administration-preview" className="hover:text-nite-text-primary">Projeto Aurora</Link><span aria-hidden="true">/</span><strong className="truncate font-medium text-nite-text-primary">{pathname.includes("/equipe") ? "Equipe" : "Configurações"}</strong></nav> : <span className="text-type-body-compact text-nite-text-secondary">Prévia visual de Projetos</span>}</div>
        <div className={styles.headerControls}><label className={styles.scenarioControl}><span>Cenário</span><select aria-label="Cenário demonstrativo" value={scenario} onChange={event => { const value = event.currentTarget.value; if (value === "manager" || value === "member" || value === "empty") setScenario(value); }}><option value="manager">Gestão do projeto</option><option value="member">Integrante</option><option value="empty">Equipe vazia</option></select></label>
        <ThemeControl className="theme-control"/><span className="grid size-9 shrink-0 place-items-center rounded-full bg-nite-surface-elevated text-type-body-compact font-semibold text-nite-text-secondary" aria-label="Demonstração: Marina Lima">ML</span></div>
      </header>
      <PreviewScenarioContext.Provider value={[scenario, setScenario]}><main id="preview-content" className="mx-auto min-w-0 max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">{children}</main></PreviewScenarioContext.Provider>
    </div>
  </div>;
}
