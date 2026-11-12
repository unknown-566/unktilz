// Color maths for the color tools: parsing, conversions between spaces, contrast, harmonies,
// color blindness. Colors are sRGB with each channel 0…1. No libraries.

export type RGB = { r: number; g: number; b: number };
type V3 = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clampRgb = (c: RGB): RGB => ({ r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) });
const round = (v: number, d = 0) => {
  const k = 10 ** d;
  const x = Math.round(v * k) / k;
  return Object.is(x, -0) ? 0 : x;
};
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

// ---- sRGB, hex, 0–255 ----

export const to255 = (c: RGB): V3 => [Math.round(clamp01(c.r) * 255), Math.round(clamp01(c.g) * 255), Math.round(clamp01(c.b) * 255)];
export const from255 = (r: number, g: number, b: number): RGB => ({ r: r / 255, g: g / 255, b: b / 255 });
export const toHex = (c: RGB) => `#${to255(c).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
/** The 24-bit number Minecraft uses for dyed leather, potion and firework colors (0xRRGGBB as decimal). */
export const toDecimal = (c: RGB) => {
  const [r, g, b] = to255(c);
  return (r << 16) | (g << 8) | b;
};

export function fromHex(text: string): RGB | null {
  const m = text.trim().match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((x) => x + x).join('');
  return from255(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}

// ---- HSL, HSV, CMYK (hue in degrees, the rest 0…1) ----

export function rgbToHsv({ r, g, b }: RGB): V3 {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [wrapHue(h * 60), max ? d / max : 0, max];
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + wrapHue(h) / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1) };
}

export function rgbToHsl(c: RGB): V3 {
  const [h, , v] = rgbToHsv(c);
  const min = Math.min(c.r, c.g, c.b);
  const l = (v + min) / 2;
  const s = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + wrapHue(h) / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbToCmyk({ r, g, b }: RGB): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

export const cmykToRgb = (c: number, m: number, y: number, k: number): RGB => ({ r: (1 - c) * (1 - k), g: (1 - m) * (1 - k), b: (1 - y) * (1 - k) });

// ---- linear light, OKLab / OKLCH, CIE Lab / LCH ----

const lin = (v: number) => (Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
const delin = (v: number) => (Math.abs(v) <= 0.0031308 ? v * 12.92 : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055));
export const toLinear = (c: RGB): V3 => [lin(c.r), lin(c.g), lin(c.b)];
export const fromLinear = ([r, g, b]: V3): RGB => ({ r: delin(r), g: delin(g), b: delin(b) });

const mul = (m: number[], [x, y, z]: V3): V3 => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

export function rgbToOklab(c: RGB): V3 {
  const [l, m, s] = mul([0.4122214708, 0.5363325363, 0.0514459929, 0.2119034982, 0.6806995451, 0.1073969566, 0.0883024619, 0.2817188376, 0.6299787005], toLinear(c)).map(Math.cbrt) as V3;
  return mul([0.2104542553, 0.793617785, -0.0040720468, 1.9779984951, -2.428592205, 0.4505937099, 0.0259040371, 0.7827717662, -0.808675766], [l, m, s]);
}

export function oklabToRgb(lab: V3): RGB {
  const [l, m, s] = mul([1, 0.3963377774, 0.2158037573, 1, -0.1055613458, -0.0638541728, 1, -0.0894841775, -1.291485548], lab).map((v) => v ** 3) as V3;
  return fromLinear(mul([4.0767416621, -3.3077115913, 0.2309699292, -1.2684380046, 2.6097574011, -0.3413193965, -0.0041960863, -0.7034186147, 1.707614701], [l, m, s]));
}

const toPolar = ([l, a, b]: V3): V3 => {
  const c = Math.hypot(a, b);
  return [l, c, c < 1e-6 ? 0 : wrapHue((Math.atan2(b, a) * 180) / Math.PI)];
};
const fromPolar = ([l, c, h]: V3): V3 => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];

export const rgbToOklch = (c: RGB) => toPolar(rgbToOklab(c));
export const oklchToRgb = (l: number, c: number, h: number) => oklabToRgb(fromPolar([l, c, h]));

// CIE Lab with the D50 white, like CSS lab() and lch().
const D50: V3 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];
const LAB_E = 216 / 24389;
const LAB_K = 24389 / 27;

export function rgbToLab(c: RGB): V3 {
  const xyz = mul([0.4360747, 0.3850649, 0.1430804, 0.2225045, 0.7168786, 0.0606169, 0.0139322, 0.0971045, 0.7141733], toLinear(c));
  const [fx, fy, fz] = xyz.map((v, i) => {
    const t = v / D50[i];
    return t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
  });
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([L, a, b]: V3): RGB {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (f: number) => (f ** 3 > LAB_E ? f ** 3 : (116 * f - 16) / LAB_K);
  const xyz: V3 = [inv(fx) * D50[0], (L > LAB_K * LAB_E ? fy ** 3 : L / LAB_K) * D50[1], inv(fz) * D50[2]];
  return fromLinear(mul([3.1338561, -1.6168667, -0.4906146, -0.9787684, 1.9161415, 0.033454, 0.0719453, -0.2289914, 1.4052427], xyz));
}

export const rgbToLch = (c: RGB) => toPolar(rgbToLab(c));

/** Whether a color worked out in another space fits in sRGB (it gets clipped when it doesn't). */
export const inGamut = (c: RGB, eps = 1e-4) => [c.r, c.g, c.b].every((v) => v >= -eps && v <= 1 + eps);

// ---- contrast (WCAG 2) ----

/** Relative luminance, 0 (black) to 1 (white). */
export const luminance = (c: RGB) => {
  const [r, g, b] = toLinear(clampRgb(c));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: RGB, b: RGB) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Which WCAG levels a contrast ratio passes: normal text needs 4.5 (AA) / 7 (AAA), large text 3 / 4.5. */
export const wcag = (ratio: number) => ({ aa: ratio >= 4.5, aaa: ratio >= 7, aaLarge: ratio >= 3, aaaLarge: ratio >= 4.5 });

/** Black or white, whichever reads better on this color. */
export const textOn = (c: RGB): RGB => (contrast(c, { r: 0, g: 0, b: 0 }) >= contrast(c, { r: 1, g: 1, b: 1 }) ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 });

// ---- relatives ----

export type HarmonyKind = 'complement' | 'triad' | 'analogous' | 'split' | 'square';
const HARMONY: Record<HarmonyKind, number[]> = {
  complement: [0, 180],
  triad: [0, 120, 240],
  analogous: [-30, 0, 30],
  split: [0, 150, 210],
  square: [0, 90, 180, 270],
};

/** Colors that go together, turned around the color wheel (HSL hue, like most color tools). */
export function harmony(c: RGB, kind: HarmonyKind): RGB[] {
  const [h, s, l] = rgbToHsl(c);
  return HARMONY[kind].map((d) => (d === 0 ? c : hslToRgb(h + d, s, l)));
}

const mix = (a: RGB, b: RGB, t: number): RGB => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
/** The color mixed step by step with white (tints) or black (shades): `steps` colors, the first is the color itself. */
export const tints = (c: RGB, steps = 9) => Array.from({ length: steps }, (_, i) => mix(c, { r: 1, g: 1, b: 1 }, i / steps));
export const shades = (c: RGB, steps = 9) => Array.from({ length: steps }, (_, i) => mix(c, { r: 0, g: 0, b: 0 }, i / steps));

// ---- color blindness (Machado, Oliveira & Fernandes 2009, full strength) ----

export type Vision = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
const CVD: Record<Exclude<Vision, 'achromatopsia'>, number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

export function simulate(c: RGB, vision: Vision): RGB {
  if (vision === 'achromatopsia') {
    const y = luminance(c);
    return clampRgb(fromLinear([y, y, y]));
  }
  return clampRgb(fromLinear(mul(CVD[vision], toLinear(c))));
}

// ---- distance and names ----

/** How different two colors look (distance in OKLab; about 0.02 is just noticeable). */
export function distance(a: RGB, b: RGB) {
  const [l1, a1, b1] = rgbToOklab(a);
  const [l2, a2, b2] = rgbToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function nearest<T>(c: RGB, list: readonly T[], colorOf: (x: T) => RGB): { item: T; distance: number } {
  let best = list[0];
  let bestD = Infinity;
  const [l1, a1, b1] = rgbToOklab(c);
  for (const x of list) {
    const [l2, a2, b2] = rgbToOklab(colorOf(x));
    const d = Math.hypot(l1 - l2, a1 - a2, b1 - b2);
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  return { item: best, distance: bestD };
}

// The CSS color names (CSS Color 4), "name hex" pairs.
const NAMED_RAW =
  'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32';

export const NAMED: { name: string; hex: string; rgb: RGB }[] = [];
for (let i = 0, p = NAMED_RAW.split(' '); i < p.length; i += 2) {
  // The "grey" spellings are duplicates of "gray" ones; keep one of each for the nearest-name search.
  if (p[i].includes('grey')) continue;
  NAMED.push({ name: p[i], hex: `#${p[i + 1].toUpperCase()}`, rgb: fromHex(p[i + 1])! });
}

export const nearestName = (c: RGB) => nearest(c, NAMED, (n) => n.rgb);

// ---- parsing what people type or paste ----

let probe: CanvasRenderingContext2D | null = null;

/**
 * A color from text: hex (with or without #, 3/4/6/8 digits), "59, 130, 246", a decimal number
 * (Minecraft's 3900150), a Minecraft code (&9 / §9), or anything CSS knows (rgb(), hsl(), oklch(),
 * lab(), color names…, read by the browser itself). Transparency is ignored. Null when it isn't one.
 */
export function parseColor(text: string, mcColors?: readonly { code: string; hex: string }[]): RGB | null {
  const s = text.trim();
  if (!s) return null;
  const hex = fromHex(s);
  if (hex && !(/^\d+$/.test(s) && s.length !== 6 && s.length !== 3)) return hex;
  if (/^\d{1,8}$/.test(s)) {
    const n = Number(s);
    if (n <= 0xffffff) return from255((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  const triple = s.match(/^(\d{1,3})[\s,;]+(\d{1,3})[\s,;]+(\d{1,3})$/);
  if (triple) {
    const v = triple.slice(1).map(Number);
    if (v.every((x) => x <= 255)) return from255(v[0], v[1], v[2]);
  }
  const mc = s.match(/^[&§]([0-9a-f])$/i);
  if (mc && mcColors) {
    const found = mcColors.find((x) => x.code === mc[1].toLowerCase());
    if (found) return fromHex(found.hex);
  }
  if (typeof CSS === 'undefined' || !CSS.supports('color', s)) return null;
  // The browser turns any CSS color into pixels; one opaque pixel on black gives the color.
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return null;
  probe.globalCompositeOperation = 'copy';
  probe.fillStyle = '#000';
  probe.fillStyle = s;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  if (a === 0) return null;
  return from255(r, g, b);
}

// ---- writing ----

const pct = (v: number, d = 1) => `${round(v * 100, d)}%`;

/** The color in every common notation, ready to copy. */
export function notations(c: RGB) {
  const [r, g, b] = to255(c);
  const [hh, hs, hl] = rgbToHsl(c);
  const [vh, vs, vv] = rgbToHsv(c);
  const [ol, oa, ob] = rgbToOklab(c);
  const [, oc, oh] = rgbToOklch(c);
  const [L, A, B] = rgbToLab(c);
  const [, lc, lh] = rgbToLch(c);
  const [cc, cm, cy, ck] = rgbToCmyk(c);
  return [
    { id: 'hex', label: 'HEX', value: toHex(c) },
    { id: 'rgb', label: 'RGB', value: `rgb(${r}, ${g}, ${b})` },
    { id: 'hsl', label: 'HSL', value: `hsl(${round(hh, 1)}, ${pct(hs)}, ${pct(hl)})` },
    { id: 'hsv', label: 'HSV / HSB', value: `hsv(${round(vh, 1)}, ${pct(vs)}, ${pct(vv)})` },
    { id: 'oklch', label: 'OKLCH', value: `oklch(${round(ol, 4)} ${round(oc, 4)} ${round(oh, 1)})` },
    { id: 'oklab', label: 'OKLab', value: `oklab(${round(ol, 4)} ${round(oa, 4)} ${round(ob, 4)})` },
    { id: 'lab', label: 'Lab', value: `lab(${round(L, 2)} ${round(A, 2)} ${round(B, 2)})` },
    { id: 'lch', label: 'LCH', value: `lch(${round(L, 2)} ${round(lc, 2)} ${round(lh, 1)})` },
    { id: 'cmyk', label: 'CMYK', value: `cmyk(${pct(cc, 0)}, ${pct(cm, 0)}, ${pct(cy, 0)}, ${pct(ck, 0)})` },
    { id: 'float', label: 'RGB 0–1', value: `${round(r / 255, 3)}, ${round(g / 255, 3)}, ${round(b / 255, 3)}` }, // i18n-ignore (shown via t() in Cards)
    { id: 'decimal', label: 'Decimal', value: String(toDecimal(c)) }, // i18n-ignore
  ] as const;
}
