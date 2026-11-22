"use client";

import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { calendarDays, dateKey, localToday, shiftMonth } from "./calendar";
import { cx } from "./cx";
import styles from "./query-controls.module.css";

export type DatePickerProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "size">;

export function DatePicker({ className, ...props }: DatePickerProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLSpanElement>(null);
  const [month, setMonth] = useState(String(props.value || props.defaultValue || "2000-01-01").slice(0, 7) + "-01");
  const [selected, setSelected] = useState(String(props.value || props.defaultValue || ""));
  const [open, setOpen] = useState(false);
  const [focusedDay, setFocusedDay] = useState("");
  const disabled = props.disabled || props.readOnly;
  function position() {
    const rect = trigger.current?.getBoundingClientRect();
    const panel = popover.current;
    if (!rect || !panel) return;
    panel.style.left = `${Math.max(8, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, rect.bottom + panel.offsetHeight + 6 > window.innerHeight ? rect.top - panel.offsetHeight - 6 : rect.bottom + 6)}px`;
  }
  useEffect(() => {
    if (!open) return;
    // A top-layer panel must not stay detached from its trigger after scrolling.
    const close = (event: Event) => {
      if (event.target instanceof Node && popover.current?.contains(event.target)) return;
      popover.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("resize", close); document.removeEventListener("scroll", close, true); };
  }, [open]);
  function choose(value: string) {
    const field = input.current;
    if (!field) return;
    // Go through the platform setter so React observes a real input change too.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    setSelected(value);
    popover.current?.hidePopover();
    trigger.current?.focus();
  }
  function moveDay(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -new Date(`${day}T12:00:00Z`).getUTCDay(), End: 6 - new Date(`${day}T12:00:00Z`).getUTCDay() };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const next = dateKey(date);
    if ((props.min && next < props.min) || (props.max && next > props.max)) return;
    setFocusedDay(next);
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(next.slice(0, 7) + "-01");
    requestAnimationFrame(() => popover.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus());
  }
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));
  const days = calendarDays(month);
  const available = (day: string) => !(props.min && day < props.min || props.max && day > props.max);
  const tabDay = [focusedDay, selected, localToday()].find(day => days.includes(day) && available(day)) ?? days.find(day => day.slice(0, 7) === month.slice(0, 7) && available(day));
  return <span data-slot="date-picker" className={cx(styles.control, styles.date, className)}>
    <input {...props} ref={input} type="date" lang="pt-BR"/>
    <button ref={trigger} type="button" className={styles.calendarTrigger} disabled={disabled} aria-label={`Abrir calendário${props["aria-label"] ? `: ${props["aria-label"]}` : ""}`} aria-haspopup="dialog" popoverTarget={id} onClick={() => { const value = input.current?.value || localToday(); setSelected(input.current?.value || ""); setFocusedDay(value); setMonth(value.slice(0, 7) + "-01"); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 11h18"/></svg>
    </button>
    <span ref={popover} id={id} popover="auto" role="dialog" aria-label="Escolher data" className={styles.calendar} onToggle={event => { setOpen(event.newState === "open"); if (event.newState === "open") { position(); popover.current?.querySelector<HTMLButtonElement>(`[data-day="${input.current?.value || localToday()}"]:not(:disabled)`)?.focus(); } }} onKeyDown={event => { if (event.key === "Escape") trigger.current?.focus(); }}>
      <div className={styles.calendarHeader}><button type="button" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button><strong aria-live="polite">{monthLabel}</strong><button type="button" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))}>›</button></div>
      <div className={styles.calendarGrid}>
        {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => <span className={styles.weekday} key={index} aria-hidden="true">{label}</span>)}
        {days.map(day => <button type="button" key={day} tabIndex={day === tabDay ? 0 : -1} data-day={day} data-outside={day.slice(0, 7) !== month.slice(0, 7)} aria-label={new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))} aria-pressed={selected === day} disabled={!available(day)} onClick={() => choose(day)} onKeyDown={event => moveDay(event, day)}>{Number(day.slice(-2))}</button>)}
      </div>
      <div className={styles.calendarFooter}><button type="button" disabled={Boolean(props.min && localToday() < props.min || props.max && localToday() > props.max)} onClick={() => choose(localToday())}>Hoje</button><button type="button" disabled={props.required} onClick={() => choose("")}>Limpar</button></div>
    </span>
  </span>;
}

export function DateRangePicker({ from, to, fromLabel = "De", toLabel = "Até" }: { from: DatePickerProps; to: DatePickerProps; fromLabel?: string; toLabel?: string }) {
  const id = useId();
  const fromId = from.id ?? `${id}-from`;
  const toId = to.id ?? `${id}-to`;
  return <div data-slot="date-range-picker" className={styles.range}><div><label htmlFor={fromId}>{fromLabel}</label><DatePicker {...from} id={fromId}/></div><div><label htmlFor={toId}>{toLabel}</label><DatePicker {...to} id={toId}/></div></div>;
}
