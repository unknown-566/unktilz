import { useSyncExternalStore } from 'react';
import type { Area, Img } from '../../../lib/mc/pack/pixels';

/** How an animation plays: frames in order with their time in ticks, smooth or not, frame height. */
export type LiveAnim = { order: { index: number; ticks: number }[]; interpolate: boolean; fh: number };
export type LiveState = { path: string; img: Img; orig: Img | null; area: Area; version: number; anim: LiveAnim | null } | null;

/** What the editor shows right now (also while painting), for the preview column. */
export class LiveTexture {
  private state: LiveState = null;
  private listeners = new Set<() => void>();
  private frame = 0;

  set(s: LiveState) {
    this.state = s;
    // Several changes in one go tell the preview once (also in a background tab, where
    // requestAnimationFrame would wait).
    if (this.frame) return;
    this.frame = 1;
    queueMicrotask(() => {
      this.frame = 0;
      this.listeners.forEach((l) => l());
    });
  }

  get = () => this.state;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const useLive = (live: LiveTexture) => useSyncExternalStore(live.subscribe, live.get);
