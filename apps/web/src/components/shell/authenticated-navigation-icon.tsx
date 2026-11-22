"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useLottieLight, type LottieInstance } from "lottie-react";
import { createNavigationIconPlayback, type IconInteraction } from "./navigation-icon-playback";
import dashboard from "../../../public/lottie/sidebar/dashboard.json";
import checklist from "../../../public/lottie/sidebar/checklist.json";
import cards from "../../../public/lottie/sidebar/cards.json";
import video from "../../../public/lottie/sidebar/video.json";
import clock from "../../../public/lottie/sidebar/clock.json";
import folder from "../../../public/lottie/sidebar/folder.json";
import trash from "../../../public/lottie/sidebar/trash.json";
import network from "../../../public/lottie/sidebar/network.json";
import inbox from "../../../public/lottie/sidebar/inbox.json";
import chart from "../../../public/lottie/sidebar/chart.json";
import books from "../../../public/lottie/sidebar/books.json";
import people from "../../../public/lottie/sidebar/people.json";
import invite from "../../../public/lottie/sidebar/invite.json";
import sliders from "../../../public/lottie/sidebar/sliders.json";
import styles from "./authenticated-navigation.module.css";

export type AuthenticatedNavigationIcon =
  | "dashboard"
  | "checklist"
  | "cards"
  | "video"
  | "clock"
  | "folder"
  | "trash"
  | "network"
  | "inbox"
  | "chart"
  | "books"
  | "people"
  | "invite"
  | "sliders";

export type AuthenticatedNavigationIconHandle = { interact: (source: IconInteraction, active: boolean) => void };

const animations: Record<AuthenticatedNavigationIcon, object> = {
  dashboard, checklist, cards, video, clock, folder, trash, network,
  inbox, chart, books, people, invite, sliders,
};

export const AuthenticatedNavigationIconView = forwardRef<AuthenticatedNavigationIconHandle, {
  name: AuthenticatedNavigationIcon;
  disabled?: boolean;
}>(function AuthenticatedNavigationIconView({ name, disabled = false }, ref) {
  const instanceRef = useRef<LottieInstance | null>(null);
  const playbackRef = useRef<ReturnType<typeof createNavigationIconPlayback> | null>(null);
  if (!playbackRef.current) playbackRef.current = createNavigationIconPlayback(() => instanceRef.current);
  const playback = playbackRef.current;
  const instance = useLottieLight({
    src: animations[name],
    autoplay: false,
    loop: false,
    subscriptions: { ready: () => {
      playback.setReducedMotion(disabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      playback.ready();
    }, complete: playback.complete },
    rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
  });
  instanceRef.current = instance;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => playback.setReducedMotion(disabled || media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [disabled, playback]);
  useImperativeHandle(ref, () => ({ interact: playback.interact }), [playback]);

  return <span aria-hidden="true" data-navigation-icon={name} className={styles.icon}>
    <span ref={instance.setDisplayRef} className={styles.lottieDisplay} />
  </span>;
});
