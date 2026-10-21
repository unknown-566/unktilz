import type { QrStyle } from './render';
import { tx } from '../../../lib/i18n-core';

/** Ready colour sets: one click sets the dots, eyes, background and frame. */
export type Palette = { name: string } & Pick<QrStyle, 'fg' | 'bg' | 'eyeColors' | 'eyeFrameColor' | 'eyeBallColor' | 'frameColor' | 'frameTextColor'>;

const solid = (c: string) => ({ type: 'solid' as const, colors: [c], angle: 0 });
const linear = (angle: number, ...colors: string[]) => ({ type: 'linear' as const, colors, angle });
const radial = (...colors: string[]) => ({ type: 'radial' as const, colors, angle: 0 });

export const PALETTES: Palette[] = [
  { name: tx('classic'), fg: solid('#000000'), bg: solid('#ffffff'), eyeColors: false, eyeFrameColor: '#000000', eyeBallColor: '#000000', frameColor: '#000000', frameTextColor: '#ffffff' },
  { name: tx('ink'), fg: solid('#1e2a4a'), bg: solid('#ffffff'), eyeColors: true, eyeFrameColor: '#1e2a4a', eyeBallColor: '#e2453c', frameColor: '#1e2a4a', frameTextColor: '#ffffff' },
  { name: tx('ocean'), fg: linear(45, '#0b4f8a', '#08789a'), bg: solid('#ffffff'), eyeColors: true, eyeFrameColor: '#0b3d6b', eyeBallColor: '#08789a', frameColor: '#0b4f8a', frameTextColor: '#ffffff' },
  { name: tx('sunset'), fg: linear(135, '#c81d3a', '#c2410c', '#9a5b00'), bg: solid('#fffaf2'), eyeColors: true, eyeFrameColor: '#a3102a', eyeBallColor: '#c2410c', frameColor: '#d7263d', frameTextColor: '#fffaf2' },
  { name: tx('mint'), fg: linear(90, '#0f7a5c', '#11735a'), bg: solid('#f0fbf6'), eyeColors: true, eyeFrameColor: '#0b5e47', eyeBallColor: '#11735a', frameColor: '#0f7a5c', frameTextColor: '#ffffff' },
  { name: tx('grape'), fg: radial('#4b1d8f', '#8a3ffc'), bg: solid('#ffffff'), eyeColors: true, eyeFrameColor: '#3a1470', eyeBallColor: '#c23bd4', frameColor: '#4b1d8f', frameTextColor: '#ffffff' },
  { name: tx('candy'), fg: linear(0, '#e0218a', '#7b2ff7'), bg: solid('#fff5fb'), eyeColors: true, eyeFrameColor: '#b0106a', eyeBallColor: '#7b2ff7', frameColor: '#e0218a', frameTextColor: '#ffffff' },
  { name: tx('forest'), fg: solid('#24452c'), bg: solid('#f3efe2'), eyeColors: true, eyeFrameColor: '#1a3320', eyeBallColor: '#7a5c2e', frameColor: '#24452c', frameTextColor: '#f3efe2' },
  { name: tx('coffee'), fg: solid('#3e2418'), bg: solid('#f6ead8'), eyeColors: true, eyeFrameColor: '#2b170e', eyeBallColor: '#a0522d', frameColor: '#3e2418', frameTextColor: '#f6ead8' },
  { name: tx('gold'), fg: linear(45, '#5c4400', '#8a6500', '#5c4400'), bg: solid('#fffbea'), eyeColors: false, eyeFrameColor: '#5c4400', eyeBallColor: '#5c4400', frameColor: '#5c4400', frameTextColor: '#fffbea' },
  { name: tx('minecraft'), fg: solid('#2d5a1e'), bg: solid('#c6e2a4'), eyeColors: true, eyeFrameColor: '#5b3a1e', eyeBallColor: '#2d5a1e', frameColor: '#5b3a1e', frameTextColor: '#ffffff' },
  { name: tx('night'), fg: solid('#ffffff'), bg: solid('#111418'), eyeColors: false, eyeFrameColor: '#ffffff', eyeBallColor: '#ffffff', frameColor: '#111418', frameTextColor: '#ffffff' },
  { name: tx('neon'), fg: linear(90, '#00f5d4', '#00bbf9'), bg: solid('#0b0f1a'), eyeColors: true, eyeFrameColor: '#f15bb5', eyeBallColor: '#fee440', frameColor: '#f15bb5', frameTextColor: '#0b0f1a' },
  { name: tx('red'), fg: solid('#b3001b'), bg: solid('#ffffff'), eyeColors: false, eyeFrameColor: '#b3001b', eyeBallColor: '#b3001b', frameColor: '#b3001b', frameTextColor: '#ffffff' },
  { name: tx('blue'), fg: solid('#0047ab'), bg: solid('#ffffff'), eyeColors: false, eyeFrameColor: '#0047ab', eyeBallColor: '#0047ab', frameColor: '#0047ab', frameTextColor: '#ffffff' },
  { name: tx('palette|mono'), fg: linear(90, '#000000', '#555555'), bg: solid('#ffffff'), eyeColors: true, eyeFrameColor: '#000000', eyeBallColor: '#444444', frameColor: '#222222', frameTextColor: '#ffffff' },
];
