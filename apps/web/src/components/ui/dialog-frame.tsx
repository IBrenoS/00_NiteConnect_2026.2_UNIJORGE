"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { Button } from "./button";
import { cx } from "./cx";

type DialogFrameProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "details";
  initialFocusRef?: RefObject<HTMLElement | null>;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  allowEscapeClose?: boolean;
  className?: string;
};

function DialogFrame({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  variant = "default",
  initialFocusRef,
  showCloseButton = true,
  closeOnBackdrop = true,
  allowEscapeClose = true,
  className,
}: DialogFrameProps) {
  const detailsVariant = variant === "details";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || !detailsVariant) return;

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousPaddingRight = root.style.paddingRight;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const paddingRight = Number.parseFloat(getComputedStyle(root).paddingRight) || 0;

    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      root.style.paddingRight = `${paddingRight + scrollbarWidth}px`;
    }

    return () => {
      root.style.overflow = previousOverflow;
      root.style.paddingRight = previousPaddingRight;
    };
  }, [detailsVariant, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      (initialFocusRef?.current ?? headingRef.current)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [initialFocusRef, open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (allowEscapeClose) onOpenChange(false);
  }

  function handleBackdropClick(
    event: MouseEvent<HTMLDialogElement>,
  ) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onOpenChange(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;

    const dialog = event.currentTarget;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter(
      (element) =>
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden",
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = document.activeElement;

    if (!first || !last) {
      event.preventDefault();
      headingRef.current?.focus();
      return;
    }

    if (
      event.shiftKey &&
      (active === first || active === headingRef.current || !dialog.contains(active))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      data-slot="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onClick={handleBackdropClick}
      className={cx(
        "overflow-hidden border border-nite-border-strong bg-nite-background p-0 text-nite-text-primary shadow-nite-modal backdrop:bg-black/60",
        detailsVariant
          ? "mx-1 mb-0 mt-auto max-h-[92dvh] w-[calc(100%-0.5rem)] max-w-none rounded-t-dialog rounded-b-none border-b-0 sm:m-auto sm:max-h-[calc(100dvh-4rem)] sm:w-[calc(100%-4rem)] sm:max-w-xl sm:rounded-dialog sm:border-b"
          : "m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl rounded-dialog sm:max-h-[calc(100dvh-4rem)]",
        className,
      )}
    >
      <div className={cx(
        "flex min-h-0 flex-col",
        detailsVariant ? "max-h-[92dvh] sm:max-h-[calc(100dvh-4rem)]" : "max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)]",
      )}>
        <header className={cx(
          "flex shrink-0 items-start justify-between gap-4",
          detailsVariant ? "px-5 pb-0 pt-5 sm:px-7 sm:pt-7" : "border-b border-nite-border-soft px-4 py-4 sm:px-6",
        )}>
          <div className="min-w-0">
            <h2
              ref={headingRef}
              id={titleId}
              tabIndex={-1}
              className={cx(
                "font-display",
                detailsVariant
                  ? "text-type-section-title focus-visible:outline-none"
                  : "text-type-component-title focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus",
              )}
            >
              {title}
            </h2>
            {description ? (
              <div
                id={descriptionId}
                className={cx(
                  "break-words text-type-body-compact text-nite-text-secondary",
                  detailsVariant ? "mt-2" : "mt-1",
                )}
              >
                {description}
              </div>
            ) : null}
          </div>
          {showCloseButton ? (
            <Button
              type="button"
              variant="quiet"
              aria-label={detailsVariant ? "Fechar detalhes da reunião" : "Fechar diálogo"}
              className={detailsVariant ? "size-11 shrink-0 p-0 text-nite-text-primary hover:bg-nite-surface-subtle focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-nite-focus" : undefined}
              onClick={() => onOpenChange(false)}
            >
              {detailsVariant ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-5"><path d="m6 6 12 12M18 6 6 18" /></svg> : "Fechar"}
            </Button>
          ) : null}
        </header>
        <div className={cx(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          detailsVariant ? "px-5 pb-6 pt-4 sm:px-7 sm:pb-7 sm:pt-5" : "px-4 py-4 sm:px-6 sm:py-5",
        )}>
          {children}
        </div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-nite-border-soft px-4 py-4 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

export { DialogFrame };
export type { DialogFrameProps };
