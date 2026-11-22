"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordVisibleApplicationEntry } from "../../lib/auth/access-actions";

export function AccessPresence() {
  const pathname = usePathname();
  useEffect(() => {
    const record = () => {
      if (document.visibilityState === "visible") void recordVisibleApplicationEntry();
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [pathname]);
  return null;
}
