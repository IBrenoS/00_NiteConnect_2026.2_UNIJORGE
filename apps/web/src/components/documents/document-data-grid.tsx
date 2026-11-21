import type { ComponentProps } from "react";

/** Shared table surface for the document perspectives. Each perspective supplies its columns and rows. */
export function DocumentDataGrid({className="",...props}:ComponentProps<"table">) {
  return <table {...props} className={`w-full min-w-0 table-fixed text-left ${className}`}/>;
}

export function DocumentFolderIcon({color="#f6c445",className="size-5"}:{color?:string;className?:string}) {
  return <svg aria-hidden="true" viewBox="0 0 32 26" className={`${className} shrink-0`} fill="none"><path d="M2.5 5A2.5 2.5 0 0 1 5 2.5h7.1l3 3H27A2.5 2.5 0 0 1 29.5 8v13A2.5 2.5 0 0 1 27 23.5H5A2.5 2.5 0 0 1 2.5 21z" fill={color} stroke="color-mix(in srgb, currentColor 18%, transparent)" strokeWidth=".7"/><path d="M2.8 8h26.4" stroke="white" strokeOpacity=".48" strokeWidth="1"/></svg>;
}
