import { useEffect, useReducer } from "react";
import { useStore } from "zustand";
import { appStore } from "../store";
import { uiStore } from "../ui/uiStore";
import type { Point } from "./autoArrange";

/** How long the cards take to glide to a new layout; zero under prefers-reduced-motion. */
export const ARRANGE_MS = 300;

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

/** Where a card is `t` (0–1) of the way from `from` to `to`, easing in and out. */
export function tweenPoint(from: Point, to: Point, t: number): Point {
  const k = ease(Math.min(1, Math.max(0, t)));
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

const NONE: Record<string, Point> = {};

/**
 * While an Auto-arrange is gliding, the position each moving card should be drawn at.
 * The store holds the saved layout from the first moment; this only decides what is
 * painted. The end of the glide is read live from the store, so a save that fails
 * and is rolled back sends the cards home rather than to a layout that was never kept.
 */
export function useArrangeTween(): Record<string, Point> {
  const arrangement = useStore(uiStore, (s) => s.arrangement);
  const [, frame] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!arrangement) return;
    let raf = 0;
    const step = () => {
      if (performance.now() - arrangement.startedAt >= arrangement.durationMs) {
        // Only clear our own glide: a newer arrange may have replaced it.
        if (uiStore.getState().arrangement === arrangement) uiStore.getState().endArrangement();
        return;
      }
      frame();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [arrangement]);

  if (!arrangement) return NONE;
  const t = (performance.now() - arrangement.startedAt) / arrangement.durationMs;
  const { nodes } = appStore.getState();
  const out: Record<string, Point> = {};
  for (const [id, from] of Object.entries(arrangement.from)) {
    const to = nodes[id];
    if (to) out[id] = tweenPoint(from, to, t);
  }
  return out;
}
