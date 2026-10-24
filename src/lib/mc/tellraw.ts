/**
 * /tellraw (chat) and /title (title, subtitle, action bar) from MiniMessage text, with clicking,
 * hovering and shift-clicking. Text in commands is raw JSON until 1.21.4 and SNBT from 1.21.5
 * (checked against the Minecraft Wiki's text component page).
 */
import { atLeast, snbtText, textComponent, type GiveVersion } from './give';
import { miniSegments } from './minimessage';
import { t } from '../i18n-core';

export type TextMode = 'chat' | 'title' | 'actionbar' | 'clear';

export type TextSpec = {
  mode: TextMode;
  /** Who sees it: @a, @p… or a player's name. */
  target: string;
  /** MiniMessage: the chat message, the title or the action bar text. */
  text: string;
  /** MiniMessage, titles only. */
  subtitle: string;
  /** Seconds; empty = the game's (0.5, 3.5, 1). */
  fadeIn: string;
  stay: string;
  fadeOut: string;
  /** clear: take the title away; reset: also forget the subtitle and times. */
  clearKind: 'clear' | 'reset';
};

export const emptyText = (): TextSpec => ({ mode: 'chat', target: '@a', text: '', subtitle: '', fadeIn: '', stay: '', fadeOut: '', clearKind: 'clear' });

/** MiniMessage as the text argument of a command: SNBT from 1.21.5, JSON before. */
export function commandText(mini: string, v: GiveVersion) {
  const c = textComponent(mini, v, {}, { interactive: true });
  if (atLeast(v, '1.21.5')) return snbtText(c);
  const keys = Object.keys(c);
  return keys.length === 1 && keys[0] === 'text' ? JSON.stringify(c.text) : JSON.stringify(c);
}

const num = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** What the text does that the place can't (or that won't work), as notes under the command. */
function check(mini: string, where: 'chat' | 'title', notes: string[]) {
  for (const s of miniSegments(mini)) {
    const c = s.style.click;
    if (c) {
      if (where === 'title') notes.push(t('Titles and the action bar can\'t be clicked or pointed at: clicking, hovering and shift-click only work in chat.'));
      else if (c.action === 'open_url' && !/^https?:\/\//i.test(c.value)) notes.push(t('A link must start with https:// or http:// (“{url}”), or the game rejects the command.', { url: c.value }));
      else if (c.action === 'change_page') notes.push(t('“Change page” only works in books.'));
      else if (!['open_url', 'run_command', 'suggest_command', 'copy_to_clipboard', 'change_page'].includes(c.action)) notes.push(t('“{action}” isn\'t a click action the game knows.', { action: c.action }));
    }
    if ((s.style.hover || s.style.insert) && where === 'title') notes.push(t('Titles and the action bar can\'t be clicked or pointed at: clicking, hovering and shift-click only work in chat.'));
    if (s.special?.kind === 'score' && !s.special.objective) notes.push(t('A score needs the objective’s name: <score:@s:kills>.'));
  }
}

export type TextResult = { commands: string[]; notes: string[] };

export function buildText(spec: TextSpec, v: GiveVersion): TextResult {
  const notes: string[] = [];
  const who = spec.target.trim() || '@a';
  if (spec.mode === 'clear') return { commands: [`/title ${who} ${spec.clearKind}`], notes };
  if (spec.mode === 'chat') {
    if (!spec.text.trim()) notes.push(t('Write the message first.'));
    check(spec.text, 'chat', notes);
    return { commands: [`/tellraw ${who} ${commandText(spec.text, v)}`], notes: [...new Set(notes)] };
  }
  if (spec.mode === 'actionbar') {
    if (!spec.text.trim()) notes.push(t('Write the text first.'));
    check(spec.text, 'title', notes);
    return { commands: [`/title ${who} actionbar ${commandText(spec.text, v)}`], notes: [...new Set(notes)] };
  }
  // A title: the times and the subtitle have to come first; the title command shows them.
  const commands: string[] = [];
  const times = [spec.fadeIn, spec.stay, spec.fadeOut].map(num);
  if (times.some((x) => x !== null)) {
    const [a, b, c] = times.map((x, i) => Math.max(0, Math.round((x ?? [0.5, 3.5, 1][i]) * 20)));
    commands.push(`/title ${who} times ${a} ${b} ${c}`);
  }
  if (spec.subtitle.trim()) {
    check(spec.subtitle, 'title', notes);
    commands.push(`/title ${who} subtitle ${commandText(spec.subtitle, v)}`);
  }
  check(spec.text, 'title', notes);
  if (!spec.text.trim() && !spec.subtitle.trim()) notes.push(t('Write the title first.'));
  commands.push(`/title ${who} title ${commandText(spec.text, v)}`);
  return { commands, notes: [...new Set(notes)] };
}
