"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export function MemberAvatar({ name, memberId, className = "", size = 44 }: {
  name: string; memberId?: string | null; className?: string; size?: number;
}) {
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const update = () => { setRevision(value => value + 1); setFailed(false); };
    window.addEventListener("nite-profile-photo-updated", update);
    return () => window.removeEventListener("nite-profile-photo-updated", update);
  }, []);
  const initials = name.trim().split(/\s+/).slice(0, 2)
    .map(part => part[0]?.toLocaleUpperCase("pt-BR") ?? "").join("") || "NC";
  return <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-nite-brand-soft text-nite-brand-accent ${className}`}
    style={{ width: size, height: size }}>
    {initials}
    {memberId && !failed ? <Image unoptimized src={`/api/profile-photos/${encodeURIComponent(memberId)}?v=${revision}`}
      alt="" width={size} height={size} className="absolute inset-0 size-full object-cover"
      onError={() => setFailed(true)} /> : null}
  </span>;
}
