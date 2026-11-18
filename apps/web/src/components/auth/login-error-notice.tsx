"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TransientFeedback } from "../ui/transient-feedback";
import { InlineFeedback } from "../ui";

type LoginErrorNoticeProps = {
  title: string;
  description: string;
};

function LoginErrorNotice({ title, description }: LoginErrorNoticeProps) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams.has("error")) return;

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("error");

    const query = nextSearchParams.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [searchParams]);

  return (
    <TransientFeedback messageKey={`${title}:${description}`}><InlineFeedback
      variant="error"
      announcement="assertive"
      title={title}
      description={description}
    /></TransientFeedback>
  );
}

export { LoginErrorNotice };
