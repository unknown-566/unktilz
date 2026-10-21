import { texelAt, type Layer, type Region } from '../../../lib/mc/skinLayout';
import { brush, floodFill, getPx, hexToRgba, line, rgbaToHex, setPx, shade, withMirror } from '../../../lib/mc/skinOps';
import type { SkinDoc } from './doc';
import { t } from '../../../lib/i18n-core';

export type ToolId = 'pencil' | 'eraser' | 'fill' | 'shade' | 'picker' | 'select';

export type Settings = {
  tool: ToolId;
  /** #rrggbb */
  color: string;
  size: number;
  mirror: boolean;
  /** Shade tool: 1 = lighter, −1 = darker. */
  shadeDir: 1 | -1;
  /** Which shell the 3D view paints on. */
  layer: Layer;
};

export const TOOL_LABEL: Record<ToolId, string> = {
  pencil: t('Pencil'),
  eraser: t('Eraser'),
  fill: t('Fill'),
  shade: t('Shade'),
  picker: t('Pick color'),
  select: t('Select'),
};

const SHADE_STEP = 0.12;

export const ERASE_BASE_MSG = t('The eraser only works on the outer layer. The game draws the base layer fully solid, so an erased pixel there would show up black. Paint over it instead.');

/** The color under a pixel, or null when it's see-through or outside the skin. */
export function pickColor(doc: SkinDoc, x: number, y: number): string | null {
  if (!texelAt(doc.model, x, y)) return null;
  const c = getPx(doc.pixels, x, y);
  return c[3] === 0 ? null : rgbaToHex(c);
}

/**
 * One drag of a tool: paints into the doc's working pixels as the pointer moves and becomes a single
 * history step on `end()`. Moving fast still draws a solid line because the gap to the previous
 * pixel is filled in.
 */
export class Stroke {
  private last: { x: number; y: number; region: Region } | null = null;
  private shaded = new Set<number>();
  private changed = false;
  private blockedBase = false;
  private dir: 1 | -1;

  constructor(
    private doc: SkinDoc,
    private s: Settings,
    opts: { invert?: boolean } = {},
  ) {
    this.dir = opts.invert ? (-s.shadeDir as 1 | -1) : s.shadeDir;
  }

  /** `bridge`: fill the gap from the previous pixel always (2D) or only while on the same face (3D). */
  at(x: number, y: number, bridge: 'always' | 'same-face' = 'always') {
    const t = texelAt(this.doc.model, x, y);
    if (!t) return;
    if (this.s.tool === 'fill') {
      if (!this.last) this.apply(x, y);
      this.last = { x, y, region: t.region };
      return;
    }
    const join = this.last && (bridge === 'always' || this.last.region === t.region);
    const pts = join ? line(this.last!.x, this.last!.y, x, y) : [[x, y] as [number, number]];
    for (const [px, py] of pts) this.apply(px, py);
    this.last = { x, y, region: t.region };
    if (this.changed) this.doc.touch();
  }

  private apply(x: number, y: number) {
    const m = this.doc.model;
    const d = this.doc.pixels;
    const { tool, size, mirror } = this.s;
    if (tool === 'fill') {
      const color = hexToRgba(this.s.color);
      const seeds = withMirror(m, [[x, y]], mirror);
      for (const [sx, sy] of seeds) if (floodFill(d, m, sx, sy, color)) this.changed = true;
      this.doc.touch();
      return;
    }
    for (const [px, py] of withMirror(m, brush(m, x, y, size), mirror)) {
      if (tool === 'pencil') {
        setPx(d, px, py, hexToRgba(this.s.color));
        this.changed = true;
      } else if (tool === 'eraser') {
        if (texelAt(m, px, py)!.region.layer === 'base') {
          this.blockedBase = true;
          continue;
        }
        setPx(d, px, py, [0, 0, 0, 0]);
        this.changed = true;
      } else if (tool === 'shade') {
        const k = py * 64 + px;
        if (this.shaded.has(k)) continue;
        this.shaded.add(k);
        shade(d, px, py, this.dir * SHADE_STEP);
        this.changed = true;
      }
    }
  }

  /** Commits the stroke. Returns a message for the user when something couldn't be done. */
  end(): string | null {
    const label = TOOL_LABEL[this.s.tool] + (this.s.tool === 'shade' ? (this.dir > 0 ? ` (${t('lighter')})` : ` (${t('darker')})`) : '') + (this.s.mirror ? ' · mirrored' : '');
    if (this.changed) this.doc.commit(label);
    return this.blockedBase && !this.changed ? ERASE_BASE_MSG : null;
  }

  cancel() {
    this.doc.revert();
  }
}

/** Keeps getting moves while dragging outside the element. Fails harmlessly for pointers that already ended. */
export function capture(el: Element, e: PointerEvent) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    /* pointer already gone */
  }
}
