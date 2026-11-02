import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import type { LeadershipProject } from "../../lib/projects/contracts";

export type AuthenticatedNavigationIcon =
  | "home"
  | "activity"
  | "clock"
  | "projects"
  | "calendar"
  | "team"
  | "report"
  | "attendance"
  | "settings"
  | "academic"
  | "review"
  | "access";

export type AuthenticatedNavigationItem = {
  label: string;
  icon: AuthenticatedNavigationIcon;
  href?: string;
  status?: "development";
};

export type AuthenticatedNavigationGroup = {
  label: string;
  items: AuthenticatedNavigationItem[];
  defaultOpen: boolean;
  note?: string;
  collapsible?: boolean;
};

type NavigationOptions = {
  projects: readonly LeadershipProject[];
  canAdminister: boolean;
  canCoordinate: boolean;
};

function planned(label: string, icon: AuthenticatedNavigationIcon): AuthenticatedNavigationItem {
  return { label, icon, status: "development" };
}

export function buildAuthenticatedNavigationGroups(options: NavigationOptions): AuthenticatedNavigationGroup[] {
  const groups: AuthenticatedNavigationGroup[] = [
    {
      label: "Início",
      defaultOpen: true,
      collapsible: false,
      items: [{ label: "Visão geral", icon: "home", href: "/dashboard" }],
    },
    {
      label: "Meu espaço",
      defaultOpen: true,
      items: [
        { label: "Minhas atividades", icon: "activity", href: "/atividades" },
        planned("Meus projetos", "projects"),
        planned("Agenda", "calendar"),
        { label: "Frequência", icon: "attendance", href: "/frequencia" },
      ],
    },
  ];

  if (options.projects.length > 0) {
    groups.push({
      label: "Projetos que lidero",
      defaultOpen: false,
      note: "Selecione uma visão no painel para acompanhar um projeto.",
      items: [
        planned("Atividades do projeto", "activity"),
        planned("Equipe e responsabilidades", "team"),
        planned("Relatórios do projeto", "report"),
      ],
    });
  }

  if (options.canAdminister) {
    groups.push(
      {
        label: "Acompanhamento do NITE",
        defaultOpen: false,
        items: [
          planned("Projetos", "projects"),
          planned("Atividades e entregas", "activity"),
          planned("Relatórios", "report"),
        ],
      },
      {
        label: "Administração",
        defaultOpen: false,
        items: [
          planned("Integrantes", "team"),
          planned("Acessos e convites", "access"),
          planned("Regras e parâmetros", "settings"),
        ],
      },
    );
  }

  if (options.canCoordinate) {
    groups.push({
      label: "Acompanhamento acadêmico",
      defaultOpen: false,
      items: [planned("Avaliações", "academic"), planned("Revisões e homologações", "review")],
    });
  }

  return groups;
}

type ResendNavigationGlyph = "audience" | "broadcasts" | "logs" | "metrics" | "settings" | "templates" | "workflow";

const resendGlyphForNiteNavigation: Record<AuthenticatedNavigationIcon, ResendNavigationGlyph> = {
  home: "metrics",
  activity: "logs",
  clock: "metrics",
  projects: "workflow",
  calendar: "broadcasts",
  team: "audience",
  report: "metrics",
  attendance: "logs",
  settings: "settings",
  academic: "templates",
  review: "logs",
  access: "audience",
};

const resendNavigationGlyphs: Record<ResendNavigationGlyph, ReactNode> = {
  audience: <><path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-7.5" /><path d="M16 3.13a5 5 0 0 1 0 9.75" /></>,
  broadcasts: <><path d="M16.2 7a6 6 0 0 1 0 10" /><path d="M19.5 4.6a10 10 0 0 1 0 14.8" /><path d="M7.8 7a6 6 0 0 0 0 10" /><path d="M4.5 4.6a10 10 0 0 0 0 14.8" /><circle cx="12" cy="12" r="2" /><path d="M12 14v8" /></>,
  logs: <><path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" /></>,
  metrics: <><path d="M4 20V5" /><path d="M4 20h17" /><path d="M8 16v-4" /><path d="M13 16V8" /><path d="M18 16V4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8.1 8.1 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8.1 8.1 0 0 1-1.8-1l-1.7.6-1.4-2.4 1.4-1.1a7.7 7.7 0 0 1 0-2.1l-1.4-1.1 1.4-2.4 1.7.6a8.1 8.1 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8.1 8.1 0 0 1 1.8 1l1.7-.6 1.4 2.4-1.4 1.1a7.7 7.7 0 0 1 0 2.1Z" /></>,
  templates: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  workflow: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="15" width="6" height="6" rx="1.5" /><path d="M21 8V7a4 4 0 0 0-4-4h-1" /><path d="M3 9v1a5 5 0 0 0 5 5h6a5 5 0 0 1 5 5v1" /></>,
};

function Icon({ name }: { name: AuthenticatedNavigationIcon }) {
  const glyph = resendGlyphForNiteNavigation[name];
  return <svg aria-hidden="true" data-icon={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px] shrink-0">{resendNavigationGlyphs[glyph]}</svg>;
}

function NavigationLink({ item, currentPath, onNavigate }: {
  item: AuthenticatedNavigationItem;
  currentPath: string;
  onNavigate?: () => void;
}) {
  if (!item.href) {
    return <span aria-disabled="true" aria-label={`${item.label}, em desenvolvimento`} title="Em desenvolvimento" className="flex min-h-8 items-center gap-2 rounded-control px-3 py-1 text-type-body-compact text-nite-text-muted">
      <Icon name={item.icon} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.status === "development" ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-nite-border-strong" /> : null}
    </span>;
  }
  const isCurrent = item.href === currentPath;
  return <Link href={item.href} onClick={onNavigate} aria-current={isCurrent ? "page" : undefined} className={`flex min-h-8 items-center gap-2 rounded-control px-3 py-1 text-type-body-compact transition-colors motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus ${isCurrent ? "bg-nite-brand-soft font-medium text-nite-brand-primary" : "text-nite-text-secondary hover:bg-nite-surface-subtle hover:text-nite-text-primary"}`}>
    <Icon name={item.icon} />
    <span className="min-w-0 truncate">{item.label}</span>
  </Link>;
}

function NavigationGroup({ group, currentPath, onNavigate }: {
  group: AuthenticatedNavigationGroup;
  currentPath: string;
  onNavigate?: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const ready = useRef(false);
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    try {
      const saved = window.sessionStorage.getItem(`nite-navigation-group:${group.label}`);
      details.open = saved === null ? group.defaultOpen : saved === "open";
    } catch {
      details.open = group.defaultOpen;
    }
    ready.current = true;
  }, [group.label, group.defaultOpen]);
  const rows = <>
    {group.note ? <p className="px-3 pb-1 text-type-metadata leading-relaxed text-nite-text-muted">{group.note}</p> : null}
    <ul className="grid gap-2">
      {group.items.map((item) => <li key={item.label}><NavigationLink item={item} currentPath={currentPath} onNavigate={onNavigate} /></li>)}
    </ul>
  </>;
  if (group.collapsible === false) return <section aria-label={group.label} className="grid gap-1">
    <p className="px-3 pb-1 text-type-metadata font-medium text-nite-text-muted">{group.label}</p>{rows}
  </section>;
  return <details ref={detailsRef} open={group.defaultOpen} onToggle={(event) => {
    if (!ready.current) return;
    const next = event.currentTarget.open;
    try { window.sessionStorage.setItem(`nite-navigation-group:${group.label}`, next ? "open" : "closed"); } catch { /* A expansão continua funcional sem storage. */ }
  }} className="group/nav-group grid gap-1">
    <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-3 py-1 text-type-metadata font-medium text-nite-text-muted transition-colors hover:bg-nite-surface-subtle hover:text-nite-text-primary motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus [&::-webkit-details-marker]:hidden">
      <span>{group.label}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4 transition-transform group-open/nav-group:rotate-180 motion-reduce:transition-none"><path d="m5 7.5 5 5 5-5" /></svg>
    </summary>
    <div className="pt-1">{rows}</div>
  </details>;
}

export function AuthenticatedNavigation({ groups, onNavigate }: {
  groups: AuthenticatedNavigationGroup[];
  onNavigate?: () => void;
}) {
  const currentPath = usePathname();
  return <nav aria-label="Navegação principal" className="grid gap-3">
    {groups.map((group) => <NavigationGroup key={group.label} group={group} currentPath={currentPath} onNavigate={onNavigate} />)}
  </nav>;
}
