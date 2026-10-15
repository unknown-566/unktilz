import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Category = 'minecraft' | 'dev' | 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'calc';

export type OptionValue = string | number | boolean;
export type Opts = Record<string, OptionValue>;

type OptionBase = {
  key: string;
  label: string;
  /** Short muted text next to the label, e.g. a unit. */
  hint?: string;
  /** Explanation shown in a "?" hover box next to the label. */
  help?: string;
  /** Hide the row unless this returns true for the current options. */
  when?: (opts: Opts) => boolean;
};

export type OptionSchema =
  | (OptionBase & { type: 'choice'; choices: { value: string; label: string }[]; default: string })
  | (OptionBase & { type: 'range'; min: number; max: number; step?: number; default: number; unit?: string })
  | (OptionBase & { type: 'number'; min?: number; max?: number; default: number; unit?: string })
  | (OptionBase & { type: 'toggle'; default: boolean })
  | (OptionBase & { type: 'text'; default: string; placeholder?: string; mono?: boolean });

export type Progress = { type: 'progress'; value: number };
export type Result = { type: 'result'; name: string; blob: Blob };
export type RunEvent = Progress | Result;
export type RunContext = { signal: AbortSignal };

export type Tool = {
  slug: string;
  name: string;
  category: Category;
  /** Badge text, e.g. '.ogg ⇄ .mp3'. */
  meta: string;
  /** One or two sentences under the title on the tool page. */
  description: string;
  /** Sort position inside its category. */
  order: number;
  keywords?: string[];
  /**
   * Everything runs locally unless this says otherwise: 'required' when the tool can't work
   * offline (it asks an online service), 'partly' when only some features need the internet.
   */
  online?: 'required' | 'partly';
  /** File extensions for file tools, with the dot. */
  accepts?: string[];
  /** All chosen files become one job (merge tools) instead of one job per file. */
  batch?: boolean;
  /** Slug of the opposite direction; powers the swap button. */
  reverse?: string;
  options?: OptionSchema[];
  /**
   * Image tools: show the picked picture above the options, as it will come out. `transform` is a
   * CSS transform for the options (e.g. rotation); `size` gives the output size in pixels.
   */
  preview?: { transform?: (opts: Opts) => string; size?: (w: number, h: number, opts: Opts, file: File) => { w: number; h: number } };
  /** File tools: runs from the queue. Heavy work is handed to a worker. */
  run?: (input: File[], opts: Opts, ctx: RunContext) => AsyncIterable<RunEvent>;
  /**
   * 'workbench': the tool renders a <Workbench> (editor + sticky preview), so the page goes
   * full width and related tools move below it instead of taking a side column.
   */
  layout?: 'workbench';
  /** Interactive tools: rendered on the tool page. */
  component?: LazyTool;
};

export const defineTool = (tool: Tool): Tool => tool;

/** A lazily loaded tool page that can also be fetched ahead of time (e.g. when its card is hovered). */
export type LazyTool = LazyExoticComponent<ComponentType> & { preload: () => Promise<unknown> };

export function lazyTool(load: () => Promise<{ default: ComponentType }>): LazyTool {
  let started: Promise<unknown> | null = null;
  const once = () => (started ??= load());
  return Object.assign(lazy(load), { preload: once });
}
