"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ThemeControl } from "../theme-control";
import { signOutOfNite } from "../../lib/auth/actions";
import type { NiteMember } from "../../lib/auth/identity";
import type { LeadershipProject } from "../../lib/projects/contracts";
import { AuthenticatedNavigation, buildAuthenticatedNavigationGroups } from "./authenticated-navigation";
import { MemberAvatar } from "../ui/member-avatar";

type AuthenticatedShellProps = {
  children: ReactNode;
  member: NiteMember;
  roles: string[];
  projects: LeadershipProject[];
  leadershipProjectsUnavailable: boolean;
};

const desktopQuery = "(min-width: 768px)";
const subscribeViewport = (update: () => void) => {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
};
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const serverSnapshot = () => null;

function accountRole(roles: string[]): string {
  if (roles.includes("COORDENADOR")) return "Coordenação";
  if (roles.includes("GESTOR_GERAL")) return "Gestão Geral";
  if (roles.includes("GESTOR_PROJETO")) return "Gestão de Projeto";
  return "Integrante";
}

export function AuthenticatedShell({ children, member, roles, projects, leadershipProjectsUnavailable }: AuthenticatedShellProps) {
  const desktop = useSyncExternalStore(subscribeViewport, desktopSnapshot, serverSnapshot);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const accountSummaryRef = useRef<HTMLElement>(null);
  const canAdminister = roles.some((role) => role === "GESTOR_GERAL" || role === "COORDENADOR");
  const navigationGroups = buildAuthenticatedNavigationGroups({
    projects,
    canAdminister,
    canCoordinate: roles.includes("COORDENADOR"),
  });

  useEffect(() => {
    const media = window.matchMedia(desktopQuery);
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavigationOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileNavigationOpen || desktop) {
      previousFocusRef.current?.focus();
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mobileNavigationRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Fechar navegação"]')?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(mobileNavigationRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (!mobileNavigationRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavigationOpen, desktop]);

  useEffect(() => {
    if (!mobileNavigationOpen || desktop) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mobileNavigationOpen, desktop]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const details = accountMenuRef.current;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || details?.contains(event.target)) return;
      if (details) details.open = false;
      setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [accountMenuOpen]);

  const handleAccountMenuToggle = () => {
    const details = accountMenuRef.current;
    const open = details?.open ?? false;
    setAccountMenuOpen(open);
    if (open && details) {
      window.requestAnimationFrame(() => {
        details.querySelector<HTMLElement>(
          'select:not([disabled]), button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )?.focus();
      });
    }
  };

  const handleAccountMenuKeyDown = (event: ReactKeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.open = false;
    setAccountMenuOpen(false);
    accountSummaryRef.current?.focus();
  };

  const handleAccountMenuBlur = (event: ReactFocusEvent<HTMLDetailsElement>) => {
    const nextFocus = event.relatedTarget;
    if (!(nextFocus instanceof Node) || event.currentTarget.contains(nextFocus)) return;
    event.currentTarget.open = false;
    setAccountMenuOpen(false);
  };

  const closeMobileNavigation = () => setMobileNavigationOpen(false);
  const openMobileNavigation = () => {
    const accountMenu = accountMenuRef.current;
    if (accountMenu) accountMenu.open = false;
    setAccountMenuOpen(false);
    setMobileNavigationOpen(true);
  };
  const renderSidebar = (mobile: boolean) => {
    return (
      <>
        <div className="flex h-16 shrink-0 items-center px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3 rounded-control focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" onClick={closeMobileNavigation}>
            <span className="grid size-8 shrink-0 place-items-center rounded-control bg-nite-brand-primary font-display text-type-label font-semibold text-nite-action-text">N</span>
            <span className="truncate font-display text-type-label font-semibold leading-tight text-nite-text-primary">NITE Connect</span>
          </Link>
          {mobile ? <button type="button" className="ml-auto grid size-11 place-items-center rounded-control border border-nite-border-soft text-nite-text-muted transition-colors hover:bg-nite-surface-subtle motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus md:hidden" aria-label="Fechar navegação" onClick={closeMobileNavigation}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <AuthenticatedNavigation groups={navigationGroups} onNavigate={closeMobileNavigation} />
        </div>
      </>
    );
  };

  return (
    <div className="min-h-svh bg-nite-background text-nite-text-primary">
      <a href="#authenticated-content" className="sr-only z-50 rounded-control bg-nite-surface px-3 py-2 text-nite-text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:outline-3 focus:outline-nite-focus">Ir para o conteúdo principal</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-nite-border-soft bg-nite-background md:flex" aria-label="NITE Connect">
        {desktop === true ? renderSidebar(false) : null}
      </aside>

      {desktop === false && mobileNavigationOpen ? <div className="fixed inset-0 z-50 md:hidden">
        <button type="button" aria-label="Fechar navegação" className="absolute inset-0 bg-black/45" onClick={closeMobileNavigation} />
        <aside ref={mobileNavigationRef} id="authenticated-mobile-sidebar" role="dialog" aria-modal="true" className="relative flex h-full w-[min(19rem,calc(100vw-2.75rem))] flex-col border-r border-nite-border-soft bg-nite-background shadow-nite-modal" aria-label="Navegação principal">
          {renderSidebar(true)}
        </aside>
      </div> : null}

      <div className="min-w-0 md:pl-64" inert={desktop === false && mobileNavigationOpen}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-nite-background/95 px-3 backdrop-blur sm:px-5 lg:px-7">
          <button type="button" aria-label="Abrir navegação" aria-expanded={mobileNavigationOpen} aria-controls="authenticated-mobile-sidebar" className="grid size-11 shrink-0 place-items-center rounded-control border border-nite-border-soft text-nite-text-secondary transition-colors hover:bg-nite-surface-subtle motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus md:hidden" onClick={openMobileNavigation}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0 flex-1" aria-hidden="true" />
          <details ref={accountMenuRef} onToggle={handleAccountMenuToggle} onKeyDown={handleAccountMenuKeyDown} onBlurCapture={handleAccountMenuBlur} className="relative ml-auto shrink-0">
            <summary ref={accountSummaryRef} aria-label="Abrir menu da conta" aria-controls="account-menu-panel" aria-expanded={accountMenuOpen} title="Conta" className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-nite-surface-elevated text-type-body-compact font-semibold text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">
              <MemberAvatar name={member.name} memberId={member.id} size={40}/>
            </summary>
            <div id="account-menu-panel" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100svh-5rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-panel border border-nite-border-soft bg-nite-background p-4 shadow-nite-floating">
              <p className="truncate text-type-body-compact font-semibold text-nite-text-primary">{member.name}</p>
              <p className="mt-1 break-all text-type-metadata text-nite-text-muted">{member.institutionalEmail}</p>
              <p className="mt-3 border-t border-nite-border-soft pt-3 text-type-metadata text-nite-text-secondary">{accountRole(roles)}</p>
              <Link href="/meu-perfil" className="mt-3 block min-h-9 rounded-control border-t border-nite-border-soft px-3 pt-3 text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" onClick={() => { if (accountMenuRef.current) accountMenuRef.current.open = false; setAccountMenuOpen(false); }}>Meu Perfil</Link>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-nite-border-soft pt-3">
                <span className="text-type-body-compact text-nite-text-secondary">Tema</span>
                <ThemeControl className="theme-control" />
              </div>
              <form action={signOutOfNite} className="mt-3 border-t border-nite-border-soft pt-3">
                <button type="submit" className="min-h-9 w-full rounded-control px-3 text-left text-type-body-compact text-nite-text-secondary hover:bg-nite-surface-subtle hover:text-nite-text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus">Sair da conta</button>
              </form>
            </div>
          </details>
        </header>

        <main id="authenticated-content" className="mx-auto min-w-0 max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
          {leadershipProjectsUnavailable ? <p className="mb-4 rounded-control border border-status-warning-border bg-status-warning-soft px-4 py-3 text-type-body-compact text-status-warning" role="status">Não foi possível consultar seus projetos sob liderança; os contextos disponíveis podem estar incompletos.</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
