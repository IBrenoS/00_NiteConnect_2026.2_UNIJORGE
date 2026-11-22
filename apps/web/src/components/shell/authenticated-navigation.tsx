import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { LeadershipProject } from "../../lib/projects/contracts";
import { AuthenticatedNavigationIconView, type AuthenticatedNavigationIcon, type AuthenticatedNavigationIconHandle } from "./authenticated-navigation-icon";
import styles from "./authenticated-navigation.module.css";

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
    { label: "Início", defaultOpen: true, collapsible: false, items: [{ label: "Visão geral", icon: "dashboard", href: "/dashboard" }] },
    { label: "Meu espaço", defaultOpen: true, items: [
      { label: "Minhas atividades", icon: "checklist", href: "/atividades" },
      { label: "Meus projetos", icon: "cards", href: "/meus-projetos" },
      { label: "Reuniões", icon: "video", href: "/reunioes" },
      { label: "Frequência", icon: "clock", href: "/frequencia" },
      { label: "Meus arquivos", icon: "folder", href: "/documentos" },
      { label: "Lixeira", icon: "trash", href: "/documentos/lixeira" },
    ] },
    { label: "Núcleo", defaultOpen: true, items: [{ label: "Projetos", icon: "network", href: "/projetos" }] },
  ];
  if (options.canAdminister) groups.push({ label: "Gestão do NITE", defaultOpen: true, items: [
    { label: "Atividades e entregas", icon: "inbox", href: "/gestao/atividades-e-entregas" },
    { label: "Relatórios", icon: "chart", href: "/relatorios" },
    { label: "Biblioteca do NITE", icon: "books", href: "/biblioteca" },
    { label: "Integrantes", icon: "people", href: "/gestao/integrantes" },
    { label: "Acessos e convites", icon: "invite", href: "/gestao/acessos-e-convites" },
    planned("Regras e parâmetros", "sliders"),
  ] });
  if (options.canCoordinate) groups.push({ label: "Acompanhamento acadêmico", defaultOpen: false,
    items: [planned("Avaliações", "books"), planned("Revisões e homologações", "checklist")] });
  return groups;
}

export function isAuthenticatedNavigationItemCurrent(href: string, currentPath: string): boolean {
  return href === currentPath || currentPath.startsWith(`${href}/`);
}

function currentNavigationHref(groups: AuthenticatedNavigationGroup[], currentPath: string): string | undefined {
  return groups
    .flatMap(({ items }) => items.map(({ href }) => href))
    .filter((href): href is string => href !== undefined && isAuthenticatedNavigationItemCurrent(href, currentPath))
    .sort((left, right) => right.length - left.length)[0];
}

function NavigationLink({ item, currentHref, onNavigate }: {
  item: AuthenticatedNavigationItem;
  currentHref?: string;
  onNavigate?: () => void;
}) {
  const iconRef = useRef<AuthenticatedNavigationIconHandle>(null);
  if (!item.href) {
    return <span aria-disabled="true" aria-label={`${item.label}, em desenvolvimento`} title="Em desenvolvimento" className={`${styles.link} ${styles.disabled}`}>
      <AuthenticatedNavigationIconView name={item.icon} disabled />
      <span className={styles.linkLabel}>{item.label}</span>
      {item.status === "development" ? <span aria-hidden="true" className={styles.status} /> : null}
    </span>;
  }
  const isCurrent = item.href === currentHref;
  return <Link href={item.href} onClick={onNavigate}
    onPointerEnter={(event) => { if (event.pointerType !== "touch") iconRef.current?.interact("pointer", true); }}
    onPointerLeave={() => iconRef.current?.interact("pointer", false)}
    onPointerCancel={() => iconRef.current?.interact("pointer", false)}
    onBlur={() => iconRef.current?.interact("focus", false)}
    onFocus={(event) => {
      if (event.currentTarget.matches(":focus-visible")) iconRef.current?.interact("focus", true);
    }} aria-current={isCurrent ? "page" : undefined} className={`${styles.link} ${isCurrent ? styles.active : ""}`}>
    <AuthenticatedNavigationIconView ref={iconRef} name={item.icon} />
    <span className={styles.linkLabel}>{item.label}</span>
  </Link>;
}

function NavigationGroup({ group, currentHref, onNavigate }: {
  group: AuthenticatedNavigationGroup;
  currentHref?: string;
  onNavigate?: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const ready = useRef(false);
  const containsCurrentRoute = group.items.some((item) => item.href === currentHref);
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    try {
      const saved = window.sessionStorage.getItem(`nite-navigation-group:${group.label}`);
      details.open = containsCurrentRoute || (saved === null ? group.defaultOpen : saved === "open");
    } catch {
      details.open = containsCurrentRoute || group.defaultOpen;
    }
    ready.current = true;
  }, [containsCurrentRoute, group.defaultOpen, group.label]);
  const rows = <>
    {group.note ? <p className={styles.note}>{group.note}</p> : null}
    <ul className={styles.rows}>
      {group.items.map((item) => <li key={item.label}><NavigationLink item={item} currentHref={currentHref} onNavigate={onNavigate} /></li>)}
    </ul>
  </>;
  if (group.collapsible === false) return <section aria-label={group.label} className={`${styles.group} ${styles.staticGroup}`}>
    <p className={styles.heading}>{group.label}</p>{rows}
  </section>;
  return <details ref={detailsRef} open={group.defaultOpen} onToggle={(event) => {
    if (!ready.current) return;
    const next = event.currentTarget.open;
    try { window.sessionStorage.setItem(`nite-navigation-group:${group.label}`, next ? "open" : "closed"); } catch { /* A expansão continua funcional sem storage. */ }
  }} className={`${styles.group} group/nav-group`}>
    <summary className={styles.summary}>
      <span>{group.label}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`${styles.chevron} group-open/nav-group:rotate-180`}><path d="m5 7.5 5 5 5-5" /></svg>
    </summary>
    <div className={styles.groupContent}>{rows}</div>
  </details>;
}

export function AuthenticatedNavigation({ groups, onNavigate }: {
  groups: AuthenticatedNavigationGroup[];
  onNavigate?: () => void;
}) {
  const currentPath = usePathname();
  const currentHref = currentNavigationHref(groups, currentPath);
  return <nav aria-label="Navegação principal" className={styles.navigation}>
    {groups.map((group) => <NavigationGroup key={group.label} group={group} currentHref={currentHref} onNavigate={onNavigate} />)}
  </nav>;
}
