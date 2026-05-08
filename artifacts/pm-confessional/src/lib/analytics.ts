import posthog from "posthog-js";
import { useEffect } from "react";
import { useLocation } from "wouter";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(
        "[analytics] VITE_POSTHOG_KEY not set — analytics disabled in this build.",
      );
    }
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: "2026-01-30",
    person_profiles: "identified_only",

    // Capture clicks, form submits, input changes, page views automatically.
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: true,

    // Performance + UX signals.
    capture_performance: true,
    capture_exceptions: true,
    rageclick: true,

    // Heatmaps (paired with autocapture).
    enable_heatmaps: true,

    // Session replay — record everything except text inside inputs.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
      recordCrossOriginIframes: false,
    },

    loaded: (ph) => {
      // Tag the build/environment so we can segment dev vs. prod traffic.
      ph.register({
        app: "pm-confessional",
        environment: import.meta.env.PROD ? "production" : "development",
      });
    },
  });

  initialized = true;
}

type EventProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props: EventProps = {}): void {
  if (!initialized) return;
  posthog.capture(event, props);
}

/**
 * Captures SPA route changes as PostHog `$pageview` events.
 * `capture_pageview: "history_change"` already covers history.pushState,
 * but wouter sometimes uses other mechanisms — this guarantees coverage.
 */
export function usePageviews(): void {
  const [location] = useLocation();
  useEffect(() => {
    if (!initialized) return;
    posthog.capture("$pageview", { path: location });
  }, [location]);
}
