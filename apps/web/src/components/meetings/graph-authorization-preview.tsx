"use client";

import { useRef, useState } from "react";
import { GraphAuthorizationView } from "./graph-authorization-view";

export function GraphAuthorizationPreview() {
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const requestRef = useRef(false);

  const checkAgain = () => {
    if (requestRef.current) return;
    requestRef.current = true;
    setIsChecking(true);
    setStatusMessage("Verificando a disponibilidade da integração institucional…");
    window.setTimeout(() => {
      setIsChecking(false);
      requestRef.current = false;
      setStatusMessage("A autorização institucional ainda está pendente.");
    }, 650);
  };

  return <GraphAuthorizationView state="consent-required" statusMessage={statusMessage} isChecking={isChecking} onCheckAgain={checkAgain} />;
}
