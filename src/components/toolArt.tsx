// i18n-ignore-file: icons and tiny examples (file names, commands, numbers), the same in every language
import type { ReactNode } from 'react';
import type { Tool } from '../registry';
import { CategoryIcon } from './icons';

/**
 * Every tool's own icon and the small example its card plays on hover.
 *
 * Icons are drawn here (24×24, line style like the category icons). Parts with a `ta-…` class move
 * when the card, row or title is hovered (the keyframes are in styles.css, "Tool art"): ta-spin,
 * ta-wig, ta-bob, ta-pop, ta-draw (needs pathLength="1"), ta-blink, ta-l / ta-r / ta-up / ta-down,
 * ta-snip-a / ta-snip-b, ta-scan; d1–d3 delay a part.
 *
 * A demo is what happens in the card's bottom line on hover:
 *  - type: an input is typed, then the result pops in
 *  - swatches: color chips
 *  - bars: a sound wave
 *  - pixels: a small picture built cell by cell ('.' empty, '#' the category color, '+' text
 *    color, and a few fixed colors: g green, b blue, y sand, d dark green, w white, k black)
 *  - bar: a strip filled with a CSS background (a gradient)
 */
export type Demo =
  | { kind: 'type'; from: string; to: string }
  | { kind: 'swatches'; colors: string[] }
  | { kind: 'bars'; heights: number[]; cut?: [number, number] }
  | { kind: 'pixels'; rows: string[] }
  | { kind: 'bar'; background: string };

const svg = (children: ReactNode) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const fill = { fill: 'currentColor', stroke: 'none' } as const;

const ART: Record<string, { icon: ReactNode; demo?: Demo; big?: boolean }> = {
  // ---------- minecraft ----------
  'server-status': {
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="7" rx="2" />
        <rect x="3" y="13" width="18" height="7" rx="2" />
        <circle className="ta-blink" cx="7.5" cy="7.5" r="1" {...fill} />
        <circle className="ta-blink d2" cx="7.5" cy="16.5" r="1" {...fill} />
        <path d="M12 7.5h5M12 16.5h5" />
      </>,
    ),
    demo: { kind: 'type', from: 'play.server.net', to: '● 42/100' },
  },
  'skin-viewer': {
    icon: svg(
      <>
        <rect x="5" y="3" width="14" height="14" rx="2" />
        <path className="ta-blink" d="M9.5 8.5v2M14.5 8.5v2" />
        <path d="M9.5 13.5h5M8 21h8M12 17v4" />
      </>,
    ),
    demo: { kind: 'type', from: 'Steve', to: 'steve.png' },
  },
  'skin-editor': {
    big: true,
    icon: svg(
      <>
        <rect x="3" y="3" width="12" height="12" rx="2" />
        <path d="M7 7.5v1.5M11 7.5v1.5M7 12h4" />
        <path className="ta-wig" d="M21 12l-6.5 6.5-3.5 1 1-3.5L18.5 9.5z" />
      </>,
    ),
    demo: { kind: 'pixels', rows: ['.kkkkkk.', '.k+kk+k.', '.kk##kk.', '.k####k.', '.kkkkkk.'] },
  },
  'resource-pack': {
    big: true,
    icon: svg(
      <>
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
        <path className="ta-pop" d="M8 5.2l8 4.6" />
      </>,
    ),
    demo: { kind: 'type', from: 'stone.png', to: 'my-pack.zip' },
  },
  'uuid-lookup': {
    icon: svg(
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10.5" r="2" />
        <path d="M5.5 16c.7-1.8 5.3-1.8 6 0" />
        <path className="ta-draw" pathLength={1} d="M14.5 10h4M14.5 14h3" />
      </>,
    ),
    demo: { kind: 'type', from: 'Notch', to: '069a79f4-44e9…' },
  },
  'player-head': {
    icon: svg(
      <>
        <rect x="6" y="3" width="12" height="12" rx="2" />
        <path d="M10 7.5v1.5M14 7.5v1.5M10 12h4" />
        <path d="M5 21l2-4" />
        <path className="ta-draw" pathLength={1} d="M10 20h9" />
      </>,
    ),
    demo: { kind: 'type', from: 'Notch', to: '/give @p player_head' },
  },
  'give-generator': {
    big: true,
    icon: svg(
      <g className="ta-wig">
        <path d="M20 4h-4.5L7 12.5l4.5 4.5L20 8.5z" />
        <path d="M5.5 11l7.5 7.5M8 16l-4 4" />
      </g>,
    ),
    demo: { kind: 'type', from: 'Sharpness V', to: '/give @p diamond_sword[…]' },
  },
  'summon-generator': {
    icon: svg(
      <g className="ta-wig">
        <path d="M12 3c3.6 0 6.5 5 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8 8.4 3 12 3z" />
        <circle cx="10" cy="10" r="1" {...fill} />
        <circle cx="14.5" cy="13" r="1.2" {...fill} />
        <circle cx="10.5" cy="16" r="0.9" {...fill} />
      </g>,
    ),
    demo: { kind: 'type', from: 'baby zombie', to: '/summon zombie ~ ~ ~' },
  },
  'setblock-generator': {
    icon: svg(
      <>
        <rect x="3" y="10" width="11" height="11" rx="1.5" />
        <path d="M3 15.5h11M8.5 10v11" />
        <path className="ta-pop" d="M18 3v6M15 6h6" />
      </>,
    ),
    demo: { kind: 'type', from: '10 × 5 × 10', to: '/fill ~ ~ ~ ~9 ~4 ~9' },
  },
  'tellraw-generator': {
    icon: svg(
      <>
        <path d="M4 5h16v11H10l-4 4v-4H4z" />
        <path className="ta-draw" pathLength={1} d="M8 9h8" />
        <path className="ta-draw d1" pathLength={1} d="M8 12h5" />
      </>,
    ),
    demo: { kind: 'type', from: '<red>Hello!', to: '/tellraw @a {…}' },
  },
  'motd-generator': {
    icon: svg(
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <rect x="6" y="9" width="4" height="6" rx="0.5" />
        <path className="ta-draw" pathLength={1} d="M12.5 10.5h6" />
        <path className="ta-draw d1" pathLength={1} d="M12.5 13.5h4" />
      </>,
    ),
    demo: { kind: 'type', from: '&aWelcome &lhome', to: 'motd=§aWelcome…' },
  },
  'color-codes': {
    icon: svg(
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect className="ta-pop" x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect className="ta-pop d1" x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect className="ta-pop d2" x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </>,
    ),
    demo: { kind: 'swatches', colors: ['#aa0000', '#ffaa00', '#ffff55', '#55ff55', '#55ffff', '#5555ff', '#ff55ff', '#ffffff'] },
  },
  'advanced-server-list': {
    icon: svg(
      <>
        <path d="M3 6h10M3 12h10M3 18h10" />
        <path className="ta-pop" d="M17 18v-3" />
        <path className="ta-pop d1" d="M21 18V9" />
      </>,
    ),
    demo: { kind: 'type', from: 'maintenance', to: 'profile.yml' },
  },
  'seed-map': {
    big: true,
    icon: svg(
      <>
        <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
        <path d="M9 4v14M15 6v14" />
        <circle className="ta-bob" cx="12" cy="11" r="1.6" {...fill} />
      </>,
    ),
    demo: { kind: 'pixels', rows: ['bbggggdddyyb', 'bgggdddddyyb', 'bbggddwwdgbb', 'bbbgggwdggbb', 'bbbbggggbbbb'] },
  },
  'nether-portal': {
    icon: svg(
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <rect x="8.5" y="6.5" width="7" height="11" />
        <path className="ta-draw" pathLength={1} d="M10.5 15c0-3.5 3-2 3-6" />
      </>,
    ),
    demo: { kind: 'type', from: '800, 64, -160', to: '100, 64, -20' },
  },
  'chunk-finder': {
    icon: svg(
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        <rect className="ta-blink" x="10.2" y="10.2" width="3.6" height="3.6" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: '100, 64, -20', to: 'r.0.-1.mca' },
  },
  'slime-chunks': {
    icon: svg(
      <g className="ta-bob">
        <rect x="4" y="6" width="16" height="14" rx="3" />
        <path d="M9 11v2M15 11v2M11 16.5h2" />
      </g>,
    ),
    demo: { kind: 'pixels', rows: ['..#....#..#.', '.....#......', '#..#.....#..', '......#....#', '.#....#..#..'] },
  },
  'circle-generator': {
    icon: svg(<path className="ta-draw" pathLength={1} d="M9 3h6v2h3v3h2v8h-2v3h-3v2H9v-2H6v-3H4V8h2V5h3z" />),
    demo: { kind: 'pixels', rows: ['..###..', '.#...#.', '#.....#', '.#...#.', '..###..'] },
  },
  'xp-calculator': {
    icon: svg(
      <>
        <path d="M9 3h6M10 3v4l-4 6v5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-5l-4-6V3" />
        <path d="M6.5 14h11" />
        <circle className="ta-bob" cx="10.5" cy="17.5" r="0.9" {...fill} />
        <circle className="ta-bob d1" cx="13.5" cy="16.8" r="0.9" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: 'lvl 0 → 30', to: '1,395 xp' },
  },
  'stack-calculator': {
    icon: svg(
      <>
        <rect x="3" y="8" width="18" height="12" rx="1.5" />
        <path d="M3 13h18" />
        <rect x="10.5" y="11.5" width="3" height="3" rx="0.5" />
        <path className="ta-up" d="M5 8V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V8" />
      </>,
    ),
    demo: { kind: 'type', from: '5000', to: '78 × 64 + 8' },
  },
  'map-art': {
    icon: svg(
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect className="ta-pop" x="7" y="7" width="3.5" height="3.5" {...fill} />
        <rect className="ta-pop d1" x="13.5" y="10" width="3.5" height="3.5" {...fill} />
        <rect className="ta-pop d2" x="8.5" y="14" width="3.5" height="3.5" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: 'photo.png', to: 'map.litematic' },
  },
  'server-properties': {
    icon: svg(
      <>
        <path d="M4 7h9M18 7h2M4 17h3M12 17h8" />
        <circle className="ta-r" cx="15.5" cy="7" r="2.2" />
        <circle className="ta-l" cx="9.5" cy="17" r="2.2" />
      </>,
    ),
    demo: { kind: 'type', from: 'pvp=true', to: 'pvp=false' },
  },

  // ---------- dev ----------
  'json-formatter': {
    icon: svg(
      <>
        <path className="ta-l" d="M8.5 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3" />
        <path className="ta-r" d="M15.5 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3" />
        <circle className="ta-blink" cx="12" cy="12" r="1" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: '{"a":1,"b":2}', to: '{ "a": 1, "b": 2 }' },
  },
  'encode-encrypt': {
    big: true,
    icon: svg(
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path className="ta-up" d="M8 11V8a4 4 0 0 1 8 0v3" />
        <circle cx="12" cy="15.5" r="1.3" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: 'hello', to: 'aGVsbG8=' },
  },
  bitwise: {
    icon: svg(
      <>
        <path className="ta-l" d="M5 8l2.5-2v12" />
        <rect className="ta-l d1" x="12.5" y="6" width="6" height="12" rx="3" />
        <path className="ta-blink" d="M5 21.5h14" />
      </>,
    ),
    demo: { kind: 'type', from: '0b1011 << 2', to: '= 44' },
  },
  'uuid-generator': {
    icon: svg(
      <g className="ta-wig">
        <path d="M9 4L7 20M17 4l-2 16M4 9h16M4 15h16" />
      </g>,
    ),
    demo: { kind: 'type', from: 'v4', to: '3f2b8c1e-9d4a-4e7b…' },
  },

  // ---------- image ----------
  'image-converter': {
    icon: svg(
      <>
        <rect x="3" y="3" width="11" height="11" rx="2" />
        <rect className="ta-pop" x="10" y="10" width="11" height="11" rx="2" />
        <circle cx="7" cy="7" r="1.2" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: 'photo.heic', to: 'photo.jpg' },
  },
  'gif-maker': {
    big: true,
    icon: svg(
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" />
        <path className="ta-pop" d="M10.5 9.5l4 2.5-4 2.5z" {...fill} />
      </>,
    ),
    demo: { kind: 'type', from: 'clip.mp4', to: 'meme.gif' },
  },
  'bg-remover': {
    big: true,
    icon: svg(
      <>
        <rect className="ta-blink" x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
        <circle cx="12" cy="10" r="3" />
        <path d="M6.5 19.5c.8-3.6 10.2-3.6 11 0" />
      </>,
    ),
    demo: { kind: 'type', from: 'photo.jpg', to: 'cutout.png' },
  },
  'resize-image': {
    icon: svg(
      <>
        <rect x="3" y="11" width="10" height="10" rx="1.5" />
        <g className="ta-pop">
          <path d="M15 3h6v6M21 3l-7 7" />
        </g>
      </>,
    ),
    demo: { kind: 'type', from: '4000 × 3000', to: '1920 × 1440' },
  },
  'crop-image': {
    icon: svg(
      <>
        <path className="ta-draw" pathLength={1} d="M7 2v15h15" />
        <path className="ta-draw d1" pathLength={1} d="M2 7h15v15" />
      </>,
    ),
    demo: { kind: 'type', from: '16:9', to: '1:1' },
  },

  // ---------- color ----------
  'color-picker': {
    big: true,
    icon: svg(
      <g className="ta-wig">
        <path d="M17.5 3l3.5 3.5-3 3-3.5-3.5z" />
        <path d="M13.5 7.5L5 16v3h3l8.5-8.5" />
        <path d="M4 21h.01" />
      </g>,
    ),
    demo: { kind: 'swatches', colors: ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e3a8a'] },
  },
  'image-palette': {
    icon: svg(
      <>
        <rect x="3" y="3" width="18" height="11" rx="2" />
        <path d="M3 11l4.5-4 4 3.5 3-2 6.5 4.5" />
        <rect className="ta-pop" x="3" y="17" width="4" height="4" rx="1" {...fill} />
        <rect className="ta-pop d1" x="10" y="17" width="4" height="4" rx="1" {...fill} />
        <rect className="ta-pop d2" x="17" y="17" width="4" height="4" rx="1" {...fill} />
      </>,
    ),
    demo: { kind: 'swatches', colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'] },
  },
  gradient: {
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M9 4v12M13.5 4v12M17 4v12" opacity="0.5" />
        <circle className="ta-r" cx="7" cy="20" r="1.8" />
        <circle className="ta-l" cx="17" cy="20" r="1.8" />
      </>,
    ),
    demo: { kind: 'bar', background: 'linear-gradient(90deg in oklch, #ff6ad5, #c774e8, #ad8cff, #8795e8, #94d0ff)' },
  },

  // ---------- audio ----------
  'audio-converter': {
    icon: svg(
      <g className="ta-bob">
        <path d="M9 18V6l10-2v12" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="16.5" cy="16" r="2.5" />
      </g>,
    ),
    demo: { kind: 'type', from: 'song.wav', to: 'song.mp3' },
  },
  'audio-cutter': {
    icon: svg(
      <>
        <g className="ta-snip-a">
          <circle cx="6" cy="7" r="2.5" />
          <path d="M8 8.5L20 18" />
        </g>
        <g className="ta-snip-b">
          <circle cx="6" cy="17" r="2.5" />
          <path d="M8 15.5L20 6" />
        </g>
      </>,
    ),
    demo: { kind: 'bars', heights: [3, 6, 10, 7, 12, 14, 9, 13, 8, 11, 6, 9, 4, 7, 3], cut: [4, 10] },
  },
  'vocal-remover': {
    icon: svg(
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
        <path className="ta-draw" pathLength={1} d="M4 4l16 16" />
      </>,
    ),
    demo: { kind: 'bars', heights: [4, 8, 12, 14, 9, 13, 6, 3, 10, 14, 12, 7, 11, 5, 3], cut: [3, 5] },
  },
  'bad-audio': {
    icon: svg(
      <>
        <path d="M4 9h3l5-4v14l-5-4H4z" />
        <path className="ta-wig" d="M16 7l2.5 2.5L16 12l2.5 2.5L16 17" />
      </>,
    ),
    demo: { kind: 'bars', heights: [14, 2, 13, 14, 3, 14, 12, 1, 14, 14, 4, 13, 14, 2, 14] },
  },

  // ---------- video ----------
  'video-converter': {
    icon: svg(
      <>
        <rect x="3" y="9" width="18" height="11" rx="1.5" />
        <g className="ta-clap">
          <path d="M3 9l1-4.5 17 .5v4" />
          <path d="M8 5l-1.5 4M13 5.2l-1.5 3.8M18 5.3L16.5 9" />
        </g>
      </>,
    ),
    demo: { kind: 'type', from: 'video.mov', to: 'video.mp4' },
  },
  downloader: {
    big: true,
    icon: svg(
      <>
        <g className="ta-down">
          <path d="M12 3v12M7 10l5 5 5-5" />
        </g>
        <path d="M4 20h16" />
      </>,
    ),
    demo: { kind: 'type', from: 'youtu.be/dQw4…', to: 'video.mp4 ↓' },
  },
  'bad-video': {
    icon: svg(
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8" />
        <path className="ta-draw" pathLength={1} d="M6 11l2-3 2 5 2-6 2 5 2-3 2 2" />
      </>,
    ),
    demo: { kind: 'type', from: '1080p', to: '144p' },
  },

  // ---------- pdf ----------
  'merge-pdf': {
    icon: svg(
      <>
        <rect className="ta-r" x="3" y="3" width="8" height="10" rx="1.2" />
        <rect className="ta-l" x="13" y="3" width="8" height="10" rx="1.2" />
        <path d="M12 15.5v5.5M9.5 18.5L12 21l2.5-2.5" />
      </>,
    ),
    demo: { kind: 'type', from: 'a.pdf + b.pdf', to: 'ab.pdf' },
  },
  'organize-pdf': {
    icon: svg(
      <>
        <rect className="ta-down" x="3" y="3" width="8" height="10" rx="1.2" />
        <rect className="ta-up" x="13" y="11" width="8" height="10" rx="1.2" />
        <path d="M14 5h5v3M10 19H5v-3" opacity="0.6" />
      </>,
    ),
    demo: { kind: 'type', from: '1 2 3 4', to: '3 1 4 2' },
  },
  'split-pdf': {
    icon: svg(
      <>
        <rect className="ta-up" x="5" y="2.5" width="14" height="7" rx="1.2" />
        <rect className="ta-down" x="5" y="14.5" width="14" height="7" rx="1.2" />
        <path d="M2 12h20" strokeDasharray="2.5 2.5" />
      </>,
    ),
    demo: { kind: 'type', from: 'all.pdf', to: '1.pdf  2.pdf  3.pdf' },
  },
  'compress-pdf': {
    icon: svg(
      <>
        <rect x="6" y="3" width="12" height="18" rx="1.5" />
        <g className="ta-down">
          <path d="M12 6v4M10 8.5l2 2 2-2" />
        </g>
        <g className="ta-up">
          <path d="M12 18v-4M10 15.5l2-2 2 2" />
        </g>
      </>,
    ),
    demo: { kind: 'type', from: '12 MB', to: '3.1 MB' },
  },
  'images-to-pdf': {
    icon: svg(
      <>
        <rect x="3" y="3" width="9" height="8" rx="1.5" />
        <circle cx="6" cy="6" r="0.9" {...fill} />
        <g className="ta-pop">
          <rect x="11" y="9" width="10" height="12" rx="1.5" />
          <path d="M14 13h4M14 16.5h4" />
        </g>
      </>,
    ),
    demo: { kind: 'type', from: '3 × photo.jpg', to: 'scan.pdf' },
  },
  'pdf-to-images': {
    icon: svg(
      <>
        <rect x="3" y="3" width="10" height="12" rx="1.5" />
        <path d="M6 7h4M6 10.5h4" />
        <g className="ta-pop">
          <rect x="11" y="12" width="10" height="9" rx="1.5" />
          <path d="M11 19l3-3 2.5 2 1.5-1.5 3 2.5" />
        </g>
      </>,
    ),
    demo: { kind: 'type', from: 'doc.pdf', to: 'page-1.png …' },
  },

  // ---------- text, generators ----------
  'word-counter': {
    icon: svg(
      <>
        <path className="ta-draw" pathLength={1} d="M4 6h16" />
        <path className="ta-draw d1" pathLength={1} d="M4 11h16" />
        <path className="ta-draw d2" pathLength={1} d="M4 16h8" />
        <circle className="ta-pop d2" cx="18" cy="17.5" r="3" />
      </>,
    ),
    demo: { kind: 'type', from: 'Lorem ipsum dolor', to: '3 · 17' },
  },
  'qr-code': {
    big: true,
    icon: svg(
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM19 19h2v2h-2zM19.5 14.5h1.5" />
        <path className="ta-scan" d="M1.5 12h21" />
      </>,
    ),
    demo: { kind: 'pixels', rows: ['###.#.#.###', '#.#..#..#.#', '###.#.#.###', '..#.##.#...', '#.##..#.##.'] },
  },
};

/** The tool's own icon; a tool without one (a new tool) gets its category's. */
export function ToolIcon({ tool }: { tool: Pick<Tool, 'slug' | 'category'> }) {
  return ART[tool.slug]?.icon ?? <CategoryIcon category={tool.category} />;
}

export const toolDemo = (slug: string) => ART[slug]?.demo;
/** Tools that get a wide card with a big picture on the home page. */
export const isBig = (slug: string) => !!ART[slug]?.big;

const PIXEL: Record<string, string> = { '#': 'var(--cat)', '+': 'var(--fg)', g: '#6bbf59', d: '#3d7a3a', b: '#3f76e4', y: '#dbcf8e', w: '#f2f5f7', k: 'color-mix(in srgb, var(--fg) 30%, transparent)' };

/** The example a card plays on hover; drawn fresh each time, so it starts from the beginning. */
export function CardDemo({ demo }: { demo: Demo }) {
  switch (demo.kind) {
    case 'type': {
      const chars = [...demo.from];
      return (
        <span className="demo demo-type" aria-hidden="true">
          <span className="demo-from">
            {chars.map((c, i) => (
              <span key={i} style={{ '--n': i } as React.CSSProperties}>
                {c}
              </span>
            ))}
          </span>
          <span className="demo-to" style={{ '--n': chars.length } as React.CSSProperties}>
            <span className="demo-arrow">→</span> {demo.to}
          </span>
        </span>
      );
    }
    case 'swatches':
      return (
        <span className="demo demo-swatches" aria-hidden="true">
          {demo.colors.map((c, i) => (
            <span key={i} style={{ '--n': i, background: c } as React.CSSProperties} />
          ))}
        </span>
      );
    case 'bars':
      return (
        <span className="demo demo-bars" aria-hidden="true">
          {demo.heights.map((h, i) => (
            <span key={i} className={demo.cut && i >= demo.cut[0] && i <= demo.cut[1] ? 'in' : ''} style={{ '--n': i, height: h } as React.CSSProperties} />
          ))}
        </span>
      );
    case 'pixels':
      return (
        <span className="demo demo-pixels" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${demo.rows[0].length}, 3px)` }}>
          {demo.rows.flatMap((row, y) => [...row].map((c, x) => <span key={`${x}-${y}`} style={{ '--n': x + y, background: PIXEL[c] ?? 'transparent' } as React.CSSProperties} />))}
        </span>
      );
    case 'bar':
      return (
        <span className="demo demo-bar" aria-hidden="true">
          <span style={{ background: demo.background }} />
        </span>
      );
  }
}
