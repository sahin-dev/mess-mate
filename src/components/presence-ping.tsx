"use client";

import { useEffect } from "react";
import { PRESENCE_PING_MS } from "@/lib/presence";

/**
 * Tells the server this tab is being looked at.
 *
 * Only while the tab is actually visible: a window left open behind others, or
 * a phone with the screen off, is not somebody using the site, and counting it
 * would turn "online now" into "has a browser open somewhere".
 *
 * Renders nothing. Failures are ignored on purpose — presence is a statistic,
 * and a member who has gone offline should see no error about it.
 */
export function PresencePing() {
  useEffect(() => {
    let timer: number | undefined;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      // keepalive lets the last ping survive the page being navigated away.
      void fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {});
    };

    const start = () => {
      window.clearInterval(timer);
      ping();
      timer = window.setInterval(ping, PRESENCE_PING_MS);
    };

    const onVisibility = () => {
      // Coming back to the tab reports straight away rather than waiting out
      // the rest of an interval; leaving it stops the timer entirely.
      if (document.visibilityState === "visible") start();
      else window.clearInterval(timer);
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
