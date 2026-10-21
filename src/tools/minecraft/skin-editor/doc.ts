import { useSyncExternalStore } from 'react';
import type { Model } from '../../../lib/mc/skinLayout';
import type { Pixels } from '../../../lib/mc/skinOps';
import { t } from '../../../lib/i18n-core';

export type Step = { id: number; label: string; pixels: Pixels; model: Model };

const LIMIT = 200;
let nextId = 1;

/**
 * One open skin with its undo history. `pixels` is the live working copy: tools paint into it
 * directly (so the 3D view updates while you drag) and `commit()` records the result as a step.
 * Every step stores a full snapshot; at 16 kB per skin that's cheaper than diffing.
 */
export class SkinDoc {
  name: string;
  pixels: Pixels;
  model: Model;
  steps: Step[];
  index = 0;
  /** Bumps on every change, painting included. */
  version = 0;
  private savedId: number;
  private listeners = new Set<() => void>();

  constructor(name: string, pixels: Pixels, model: Model, label = t('Opened')) {
    this.name = name;
    this.pixels = new Uint8ClampedArray(pixels);
    this.model = model;
    this.steps = [{ id: nextId++, label, pixels: new Uint8ClampedArray(pixels), model }];
    this.savedId = this.steps[0].id;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Call after painting into `pixels` without committing yet. */
  touch() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  /** Records the current pixels and model as a new step; drops anything that was redo-able. */
  commit(label: string) {
    const cur = this.steps[this.index];
    if (this.model === cur.model && equal(this.pixels, cur.pixels)) return this.touch();
    this.steps = this.steps.slice(0, this.index + 1);
    this.steps.push({ id: nextId++, label, pixels: new Uint8ClampedArray(this.pixels), model: this.model });
    if (this.steps.length > LIMIT) this.steps.splice(1, this.steps.length - LIMIT);
    this.index = this.steps.length - 1;
    this.touch();
  }

  /** Throws away uncommitted painting. */
  revert() {
    const s = this.steps[this.index];
    this.pixels.set(s.pixels);
    this.model = s.model;
    this.touch();
  }

  goto(i: number) {
    if (i < 0 || i >= this.steps.length) return;
    this.index = i;
    this.revert();
  }

  undo = () => this.goto(this.index - 1);
  redo = () => this.goto(this.index + 1);
  get canUndo() {
    return this.index > 0;
  }
  get canRedo() {
    return this.index < this.steps.length - 1;
  }

  /** Changed since it was opened or last downloaded. */
  get dirty() {
    return this.steps[this.index].id !== this.savedId;
  }
  markSaved() {
    this.savedId = this.steps[this.index].id;
    this.touch();
  }

  /** Replaces the whole skin as one undoable step (opening another file into this slot). */
  replace(name: string, pixels: Pixels, model: Model, label: string) {
    this.name = name;
    this.pixels.set(pixels);
    this.model = model;
    this.commit(label);
    this.savedId = this.steps[this.index].id;
  }
}

function equal(a: Pixels, b: Pixels) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const noop = () => () => {};

/** Re-renders when the doc changes; returns its version. */
export function useDoc(doc: SkinDoc | null) {
  return useSyncExternalStore(doc ? doc.subscribe : noop, () => (doc ? doc.version : -1));
}
