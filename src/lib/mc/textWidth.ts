// Pixel widths of the default Minecraft font (glyph + 1px spacing). Anything not listed is 6.
const WIDTHS: Record<string, number> = {
  ' ': 4,
  '!': 2,
  '"': 4,
  "'": 2,
  '(': 4,
  ')': 4,
  '*': 4,
  ',': 2,
  '.': 2,
  ':': 2,
  ';': 2,
  '<': 5,
  '>': 5,
  '@': 7,
  I: 4,
  '[': 4,
  ']': 4,
  '`': 3,
  f: 5,
  i: 2,
  k: 5,
  l: 3,
  t: 4,
  '{': 4,
  '|': 2,
  '}': 4,
  '~': 7,
  '·': 2,
};

/** Width in game pixels; bold adds a pixel per character, like the game does. */
export function charWidth(ch: string, bold = false) {
  const base = WIDTHS[ch] ?? (ch.charCodeAt(0) > 0x2fff ? 9 : 6);
  return base + (bold && ch !== ' ' ? 1 : 0);
}

/** The server list wraps the MOTD at this width and shows at most two lines. */
export const MOTD_WIDTH = 270;
