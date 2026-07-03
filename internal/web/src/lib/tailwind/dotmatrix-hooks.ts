'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { DotMatrixPhase } from '@/lib/tailwind/dotmatrix-core';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function getPrefersReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia(reducedMotionQuery).matches;
}

function subscribePrefersReducedMotion(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', onStoreChange);

  return () => {
    query.removeEventListener('change', onStoreChange);
  };
}

function clearDotMatrixTimers(timeouts: { current: number[] }) {
  for (let i = 0; i < timeouts.current.length; i += 1) {
    window.clearTimeout(timeouts.current[i]!);
  }
  timeouts.current = [];
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribePrefersReducedMotion,
    getPrefersReducedMotionSnapshot,
    () => false
  );
}

export interface UseCyclePhaseOptions {
  active: boolean;
  cycleMsBase: number;
  speed?: number;
}

export function useCyclePhase({
  active,
  cycleMsBase,
  speed = 1,
}: UseCyclePhaseOptions): number {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const safeSpeed = speed > 0 ? speed : 1;
    const raw = cycleMsBase / safeSpeed;
    const cycleMs = raw > 0 && Number.isFinite(raw) ? raw : 1000;
    const start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = (((now - start) % cycleMs) + cycleMs) % cycleMs;
      setPhase(elapsed / cycleMs);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, cycleMsBase, speed]);

  return active ? phase : 0;
}

interface UseDotMatrixPhasesOptions {
  animated?: boolean;
  hoverAnimated?: boolean;
  speed?: number;
}

interface DotMatrixPhasesResult {
  phase: DotMatrixPhase;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function useDotMatrixPhases({
  animated = false,
  hoverAnimated = false,
  speed = 1,
}: UseDotMatrixPhasesOptions): DotMatrixPhasesResult {
  const safeSpeed = speed > 0 ? speed : 1;
  const autoRun = Boolean(animated && !hoverAnimated);
  const [hoverPhase, setHoverPhase] = useState<DotMatrixPhase>('idle');
  const timeouts = useRef<number[]>([]);
  const hoverGen = useRef(0);

  useEffect(() => {
    hoverGen.current += 1;
    clearDotMatrixTimers(timeouts);
    return () => clearDotMatrixTimers(timeouts);
  }, [autoRun, hoverAnimated]);

  const onMouseEnter = () => {
    if (!hoverAnimated || autoRun) {
      return;
    }
    clearDotMatrixTimers(timeouts);
    const gen = ++hoverGen.current;
    setHoverPhase('collapse');
    const collapseMs = Math.max(1, Math.round(300 / safeSpeed));
    const id = window.setTimeout(() => {
      if (hoverGen.current !== gen) {
        return;
      }
      setHoverPhase('hoverRipple');
    }, collapseMs);
    timeouts.current.push(id);
  };

  const onMouseLeave = () => {
    if (!hoverAnimated || autoRun) {
      return;
    }
    hoverGen.current += 1;
    clearDotMatrixTimers(timeouts);
    setHoverPhase('idle');
  };

  const phase: DotMatrixPhase = autoRun
    ? 'loadingRipple'
    : hoverAnimated
      ? hoverPhase
      : 'idle';

  return {
    phase,
    onMouseEnter,
    onMouseLeave,
  };
}
