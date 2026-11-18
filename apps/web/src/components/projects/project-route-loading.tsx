export function ProjectRouteLoading() {
  return <div role="status" aria-label="Carregando projetos" className="space-y-6 p-8 text-type-body-compact text-nite-text-muted"><p>Carregando projetos…</p><div aria-hidden="true" className="h-9 w-52 rounded-control bg-nite-surface-subtle"/><div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map(id => <div key={id} className="h-52 rounded-panel border border-nite-border-soft bg-nite-surface"/>)}</div></div>;
}
