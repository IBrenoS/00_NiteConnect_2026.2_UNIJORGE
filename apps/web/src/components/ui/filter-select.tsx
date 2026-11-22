import type { ComponentPropsWithRef } from "react";
import { cx } from "./cx";
import styles from "./query-controls.module.css";

export type FilterSelectProps = Omit<ComponentPropsWithRef<"select">, "multiple" | "size"> & { placeholder?: string };

/** Native form semantics with a themed, top-layer picker where supported. */
export function FilterSelect({ className, children, placeholder, defaultValue, value, ...props }: FilterSelectProps) {
  return <select {...props} value={value} defaultValue={placeholder && value === undefined && defaultValue === undefined ? "" : defaultValue} data-slot="filter-select" className={cx(styles.control, styles.select, className)}>
    {placeholder ? <option value="" disabled>{placeholder}</option> : null}{children}
  </select>;
}
