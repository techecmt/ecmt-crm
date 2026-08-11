"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

function isInternalNavigationLink(anchor: HTMLAnchorElement, pathname: string) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || anchor.target === "_blank") return false;
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
    return false;
  }

  const [path] = href.split("?");
  return path !== pathname;
}

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const [visible, setVisible] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const isFirstRoute = React.useRef(true);
  const timerRef = React.useRef<number | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finish = React.useCallback(() => {
    clearTimer();
    setProgress(100);
    window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }, [clearTimer]);

  const start = React.useCallback(() => {
    clearTimer();
    setVisible(true);
    setProgress(12);
    timerRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 88) return current;
        return current + Math.random() * 12;
      });
    }, 240);
  }, [clearTimer]);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isInternalNavigationLink(anchor, pathname)) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, start]);

  React.useEffect(() => {
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }

    finish();
  }, [pathname, search, finish]);

  React.useEffect(() => clearTimer, [clearTimer]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-primary/15"
    >
      <div
        className={cn(
          "h-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.45)]",
          "transition-[width] duration-200 ease-out",
          progress >= 100 && "opacity-0 transition-opacity duration-200",
        )}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <React.Suspense fallback={null}>
      <NavigationProgressBar />
    </React.Suspense>
  );
}
