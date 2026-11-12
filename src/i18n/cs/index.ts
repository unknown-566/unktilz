// The Czech dictionary: English text → Czech. Split by area; all of it loads at once when Czech is
// picked (src/lib/i18n-core.ts). Style and words: see the GLOSSARY in app.ts. A file's SAME list
// names texts that read the same in Czech (formats, names), so they count as translated.
import app from './app';
import tools, { SAME as toolsSame } from './tools';
import pdf, { SAME as pdfSame } from './pdf';
import image, { SAME as imageSame } from './image';
import video, { SAME as videoSame } from './video';
import devqr, { SAME as devqrSame } from './devqr';
import mcWorld, { SAME as mcWorldSame } from './mcWorld';
import mcGive, { SAME as mcGiveSame } from './mcGive';
import mcSummon, { SAME as mcSummonSame } from './mcSummon';
import mcText, { SAME as mcTextSame } from './mcText';
import mcSkin, { SAME as mcSkinSame } from './mcSkin';
import mcPack, { SAME as mcPackSame } from './mcPack';
import crypto, { SAME as cryptoSame } from './crypto';
import audio, { SAME as audioSame } from './audio';
import color, { SAME as colorSame } from './color';
import palette, { SAME as paletteSame } from './palette';
import gradient, { SAME as gradientSame } from './gradient';
import keywords from './keywords';

const same = Object.fromEntries([...toolsSame, ...pdfSame, ...imageSame, ...videoSame, ...devqrSame, ...mcWorldSame, ...mcGiveSame, ...mcSummonSame, ...mcTextSame, ...mcSkinSame, ...mcPackSame, ...cryptoSame, ...audioSame, ...colorSame, ...paletteSame, ...gradientSame].map((s) => [s, s]));
const all: Record<string, string> = { ...same, ...app, ...tools, ...pdf, ...image, ...video, ...devqr, ...mcWorld, ...mcGive, ...mcSummon, ...mcText, ...mcSkin, ...mcPack, ...crypto, ...audio, ...color, ...palette, ...gradient, ...keywords };
export default all;
