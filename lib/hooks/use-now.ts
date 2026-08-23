"use client";

import * as React from "react";

/**
 * Current time in ms, resolved after mount so server and client render the same
 * markup. Returns 0 until mounted, which reads as "nothing is overdue yet".
 */
export function useNowMs(intervalMs = 60_000) {
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
