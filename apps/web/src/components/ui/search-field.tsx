"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import styles from "./query-controls.module.css";

export type SearchFieldProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & { onClear?: () => void };

export function SearchField({ className, onClear, value, ...props }: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return <span data-slot="search-field" className={cx(styles.control, styles.search, className)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
    <input {...props} ref={input} type="search" value={value}/>
    {onClear && Boolean(value) ? <button type="button" className={styles.clear} disabled={props.disabled || props.readOnly} aria-label="Limpar pesquisa" onClick={() => { onClear(); input.current?.focus(); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button> : null}
  </span>;
}
