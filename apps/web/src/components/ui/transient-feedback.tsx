"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./transient-feedback.module.css";

export const FEEDBACK_VISIBLE_MS = 6_000;
export const FEEDBACK_EXIT_MS = 250;

type TransientFeedbackProps = {
  children: ReactNode;
  messageKey: string;
  queryParam?: string;
  occurrenceKey?: object;
  onDismiss?: () => void;
  className?: string;
};

export function TransientFeedback(props: TransientFeedbackProps) {
  const [received, setReceived] = useState({ response: props.occurrenceKey, occurrence: 0 });
  let occurrence = received.occurrence;
  // A fresh server response may carry the same flash code; it still deserves a new countdown.
  if (props.occurrenceKey && received.response !== props.occurrenceKey) {
    occurrence += 1;
    setReceived({ response: props.occurrenceKey, occurrence });
  }
  return <TransientFeedbackFrame key={`${props.messageKey}:${occurrence}`} {...props}/>;
}

/** Lifecycle frame; the outer key gives each message its own countdown. */
export function TransientFeedbackFrame({ children, messageKey, queryParam, onDismiss, className }: TransientFeedbackProps) {
  const [phase, setPhase] = useState<"visible" | "exiting" | "hidden">("visible");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(FEEDBACK_VISIBLE_MS);
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  const paused = phase === "visible" && (hovered || focused);

  useEffect(() => {
    if (paused || phase === "hidden") return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => {
      if (phase === "visible") {
        setPhase("exiting");
        return;
      }
      setPhase("hidden");
      if (queryParam) {
        const url = new URL(window.location.href);
        if (url.searchParams.get(queryParam) === messageKey) {
          url.searchParams.delete(queryParam);
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      dismiss.current?.();
    }, phase === "visible" ? remaining.current : FEEDBACK_EXIT_MS);
    return () => {
      window.clearTimeout(timer);
      if (phase === "visible") remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [messageKey, paused, phase, queryParam]);

  if (phase === "hidden") return null;
  return <div data-transient-feedback="" data-phase={phase} className={[styles.feedback, className].filter(Boolean).join(" ")}
    aria-hidden={phase === "exiting" ? true : undefined} inert={phase === "exiting" ? true : undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
    <div className={styles.content}>{children}</div>
  </div>;
}
