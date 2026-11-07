"use client";

import { useEffect, useRef } from "react";

const VIDEO_MEDIA_QUERY = "(min-width: 56rem) and (prefers-reduced-motion: no-preference)";
const VIDEO_SRC = "/videos/nite-connect-login.mp4";

function InstitutionalVisualPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(VIDEO_MEDIA_QUERY);
    const video = videoRef.current;
    const source = video?.querySelector("source");

    if (!video || !source) return;

    const refreshVideoSource = () => {
      if (mediaQuery.matches) {
        if (source.getAttribute("src") !== VIDEO_SRC) {
          source.setAttribute("src", VIDEO_SRC);
          video.load();
        }
      } else if (source.hasAttribute("src")) {
        video.pause();
        source.removeAttribute("src");
        video.load();
      }
    };

    mediaQuery.addEventListener("change", refreshVideoSource);
    refreshVideoSource();

    return () => mediaQuery.removeEventListener("change", refreshVideoSource);
  }, []);

  return (
    <div className="hidden min-w-0 min-[56rem]:flex min-[56rem]:min-h-svh" aria-hidden="true">
      <div className="relative h-full min-h-svh w-full overflow-hidden">
        <video
          ref={videoRef}
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          poster="/images/nite-connect-login-visual.png"
          className="absolute inset-0 size-full object-cover object-center"
        >
          <source data-src={VIDEO_SRC} type="video/mp4" />
        </video>
      </div>
    </div>
  );
}

export { InstitutionalVisualPanel };
