import { useEffect, useRef } from 'react';

export function useMountTask(task: () => void | (() => void)): void {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    return taskRef.current();
  }, []);
}

export function useFixedSimulationLoop(
  enabled: boolean,
  speedMultiplier: number,
  onFrame: (elapsedSec: number) => void,
): void {
  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let cancelled = false;
    let lastMs = performance.now();

    const loop = (nowMs: number) => {
      if (cancelled) return;
      const elapsed = Math.min(0.2, Math.max(0, (nowMs - lastMs) / 1000)) * speedRef.current;
      lastMs = nowMs;
      onFrameRef.current(elapsed);
      if (!cancelled) {
        raf = requestAnimationFrame(loop);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [enabled]);
}

export function useWindowKeydown(
  enabled: boolean,
  handler: (e: KeyboardEvent) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
