"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type AutoRefreshProps = {
  intervalMs?: number;
  enabled?: boolean;
};

export default function AutoRefresh({ intervalMs = 30000, enabled = true }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (intervalId !== undefined) {
        return;
      }

      intervalId = setInterval(() => {
        router.refresh();
      }, intervalMs);
    };

    const stop = () => {
      if (intervalId === undefined) {
        return;
      }

      clearInterval(intervalId);
      intervalId = undefined;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    if (!document.hidden) {
      start();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
