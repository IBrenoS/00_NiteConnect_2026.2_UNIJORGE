"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getMeetingGraphAvailabilityAction } from "../../lib/meetings/actions";
import { writeMeetingGraphAvailabilityCache } from "../../lib/meetings/graph-availability-cache";
import type { MeetingGraphAvailabilityResult } from "../../lib/meetings/contracts";
import { GraphAuthorizationView } from "./graph-authorization-view";
import {
  graphAuthorizationStatusMessage,
  resolveGraphAuthorizationViewState,
  type GraphAuthorizationViewState,
} from "./graph-authorization-state";

type Props = { viewerId: string };

function cacheAvailability(viewerId: string, result: MeetingGraphAvailabilityResult): void {
  try {
    writeMeetingGraphAvailabilityCache(window.sessionStorage, viewerId, result);
  } catch {
    // A verificação continua válida para esta navegação se o storage estiver bloqueado.
  }
}

function unavailableResult(): MeetingGraphAvailabilityResult {
  return { state: "unavailable", httpStatus: null, code: null };
}

export function GraphAuthorizationPage({ viewerId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<GraphAuthorizationViewState>("checking");
  const [statusMessage, setStatusMessage] = useState<string | null>("Consultando a disponibilidade da integração institucional…");
  const [isChecking, setIsChecking] = useState(false);
  const initialRequestRef = useRef<Promise<MeetingGraphAvailabilityResult> | null>(null);
  const explicitRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;
    const request = initialRequestRef.current ??= getMeetingGraphAvailabilityAction().catch(unavailableResult);
    void request.then((result) => {
      cacheAvailability(viewerId, result);
      if (!active) return;
      const nextState = resolveGraphAuthorizationViewState(result);
      if (nextState !== "consent-required") {
        router.replace("/reunioes");
        return;
      }
      setState(nextState);
      setStatusMessage(null);
    });
    return () => { active = false; };
  }, [router, viewerId]);

  const checkAgain = () => {
    if (explicitRequestRef.current) return;
    setIsChecking(true);
    setStatusMessage("Verificando a disponibilidade da integração institucional…");

    const request = getMeetingGraphAvailabilityAction()
      .catch(unavailableResult)
      .then((result) => {
        cacheAvailability(viewerId, result);
        const nextState = resolveGraphAuthorizationViewState(result);
        if (nextState === "available") {
          router.replace("/reunioes");
          return;
        }
        setState(nextState);
        setStatusMessage(nextState === "consent-required"
          ? "A autorização institucional ainda está pendente."
          : graphAuthorizationStatusMessage(nextState));
      })
      .finally(() => {
        explicitRequestRef.current = null;
        setIsChecking(false);
      });

    explicitRequestRef.current = request;
  };

  return <GraphAuthorizationView state={state} statusMessage={statusMessage} isChecking={isChecking} onCheckAgain={checkAgain} />;
}
