import { telemetry } from '@devvit/analytics/client/reddit';

/**
 * Devvit Journeys wiring. All calls are fire-and-forget: telemetry must
 * never break gameplay (outside Devvit, or before app allowlisting,
 * events are simply dropped by the platform).
 * No PII is sent — only game actions and outcomes.
 */
function safe(fn: () => Promise<unknown>) {
  try {
    void fn().catch(() => undefined);
  } catch {
    /* telemetry unavailable */
  }
}

export const journeys = {
  appReady() {
    safe(() => telemetry.appReady());
  },
  start() {
    safe(() => telemetry.startJourney());
  },
  progress(progress: number, action: string) {
    safe(() => telemetry.progress({ progress, action }));
  },
  interaction(action: string, actionDetails?: string) {
    safe(() => telemetry.interaction({ action, actionDetails }));
  },
  end(win: boolean, scoreSec: number) {
    safe(() =>
      telemetry.endJourney({
        complete: win,
        game: { win, score: Math.round(scoreSec * 10) / 10 },
      }),
    );
  },
};
