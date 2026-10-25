/**
 * A texture's .mcmeta animation (minecraft.wiki, Resource pack § Animation): the frames are squares
 * under each other; `frametime` is in game ticks (1/20 s); `frames` may list them in another order or
 * with their own time. Adding, removing or moving frames keeps that list pointing at the same
 * pictures.
 */
export type FrameRef = { index: number; time?: number };
export type Anim = { frametime: number; interpolate: boolean; frames: FrameRef[] | null };
export type Meta = { rest: Record<string, unknown>; anim: Anim | null; extra: Record<string, unknown> };

export function parseMeta(json: string | null | undefined): Meta {
  let all: Record<string, unknown> = {};
  try {
    if (json) all = JSON.parse(json) as Record<string, unknown>;
  } catch {
    all = {};
  }
  const { animation, ...rest } = all as { animation?: Record<string, unknown> };
  if (!animation || typeof animation !== 'object') return { rest, anim: null, extra: {} };
  const { frametime, interpolate, frames, ...extra } = animation;
  const list = Array.isArray(frames)
    ? (frames as unknown[])
        .map((f): FrameRef | null =>
          typeof f === 'number' ? { index: f } : f && typeof f === 'object' && typeof (f as FrameRef).index === 'number' ? { index: (f as FrameRef).index, time: typeof (f as FrameRef).time === 'number' ? (f as FrameRef).time : undefined } : null,
        )
        .filter((f): f is FrameRef => !!f)
    : null;
  return { rest, anim: { frametime: typeof frametime === 'number' && frametime > 0 ? frametime : 1, interpolate: interpolate === true, frames: list }, extra };
}

/** Back to .mcmeta text ('' when nothing is left in it). */
export function writeMeta(m: Meta): string {
  const out: Record<string, unknown> = { ...m.rest };
  if (m.anim) {
    const a: Record<string, unknown> = { ...m.extra };
    if (m.anim.frametime !== 1) a.frametime = m.anim.frametime;
    if (m.anim.interpolate) a.interpolate = true;
    if (m.anim.frames) a.frames = m.anim.frames.map((f) => (f.time === undefined ? f.index : { index: f.index, time: f.time }));
    out.animation = a;
  }
  return Object.keys(out).length ? JSON.stringify(out, null, 2) + '\n' : '';
}

export const hasAnim = (json: string | null | undefined) => !!parseMeta(json).anim;

/** The order the game plays the frames in, with each frame's time in ticks. */
export function playOrder(a: Anim, count: number): { index: number; ticks: number }[] {
  const list: FrameRef[] = a.frames?.filter((f) => f.index < count) ?? Array.from({ length: count }, (_, index) => ({ index }));
  return list.map((f) => ({ index: f.index, ticks: Math.max(1, f.time ?? a.frametime) }));
}

const map = (a: Anim, fn: (frames: FrameRef[]) => FrameRef[]): Anim => (a.frames ? { ...a, frames: fn(a.frames) } : a);

/** Frame `k` was removed. */
export const afterDelete = (a: Anim, k: number): Anim => map(a, (fr) => fr.filter((f) => f.index !== k).map((f) => (f.index > k ? { ...f, index: f.index - 1 } : f)));

/** A copy of frame `k` was put in right after it (as k + 1); it plays right after the original. */
export const afterDuplicate = (a: Anim, k: number): Anim =>
  map(a, (fr) => {
    const out: FrameRef[] = [];
    let done = false;
    for (const f of fr) {
      out.push(f.index > k ? { ...f, index: f.index + 1 } : f);
      if (f.index === k && !done) {
        out.push({ ...f, index: k + 1 });
        done = true;
      }
    }
    return out;
  });

/** Frames `i` and `j` swapped places in the picture; the order list still plays the same pictures. */
export const afterSwap = (a: Anim, i: number, j: number): Anim => map(a, (fr) => fr.map((f) => (f.index === i ? { ...f, index: j } : f.index === j ? { ...f, index: i } : f)));
