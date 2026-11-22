import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Badge, Button } from "../ui";
import { cx } from "../ui/cx";

type FilterToolbarProps = Omit<ComponentPropsWithoutRef<"form">, "children"> & {
  children: ReactNode;
  actions?: ReactNode;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  activeLabel?: string;
  compact?: boolean;
  advanced?: ReactNode;
  advancedActive?: boolean;
};

function FilterToolbar({
  children,
  actions,
  hasActiveFilters = false,
  onClear,
  clearLabel = "Limpar filtros",
  activeLabel = "Filtros aplicados",
  compact = false,
  advanced,
  advancedActive = false,
  className,
  ...props
}: FilterToolbarProps) {
  return (
    <form
      {...props}
      data-slot="filter-toolbar"
      data-active={hasActiveFilters ? "true" : "false"}
      className={cx("grid min-w-0 gap-4", className)}
    >
      <div className={compact ? "flex min-w-0 flex-wrap items-end gap-2" : "flex min-w-0 flex-wrap items-end gap-4"}>
        <div className={compact ? "flex min-w-0 flex-1 basis-full flex-wrap items-end gap-2 sm:basis-auto [&>label]:min-w-0 [&>label]:max-w-full" : "grid min-w-0 flex-1 basis-full grid-cols-1 gap-4 sm:basis-auto sm:grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]"}>
          {children}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:ml-auto">
        {hasActiveFilters ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Badge variant="info">{activeLabel}</Badge>
            {onClear ? (
              <Button type="button" variant="quiet" size={compact ? "compact" : "default"} onClick={onClear}>
                {clearLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
        {actions}
        </div>
      </div>
      {advanced ? <details open={advancedActive || undefined} className="min-w-0 rounded-control border border-nite-border-soft bg-nite-surface">
        <summary className="cursor-pointer rounded-control px-3 py-2 text-type-body-compact font-medium text-nite-text-secondary hover:bg-nite-surface-subtle focus-visible:outline-2 focus-visible:outline-nite-focus">Filtros avançados{advancedActive ? " · aplicados" : ""}</summary>
        <div className="grid min-w-0 grid-cols-1 items-start gap-3 border-t border-nite-border-soft p-3 sm:grid-cols-2 xl:grid-cols-3">{advanced}</div>
      </details> : null}
    </form>
  );
}

export { FilterToolbar };
export type { FilterToolbarProps };
