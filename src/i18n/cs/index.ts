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
import mcText, { SAME as mcTextSame } from './mcText';
import mcSkin, { SAME as mcSkinSame } from './mcSkin';

const same = Object.fromEntries([...toolsSame, ...pdfSame, ...imageSame, ...videoSame, ...devqrSame, ...mcWorldSame, ...mcGiveSame, ...mcTextSame, ...mcSkinSame].map((s) => [s, s]));
const all: Record<string, string> = { ...same, ...app, ...tools, ...pdf, ...image, ...video, ...devqr, ...mcWorld, ...mcGive, ...mcText, ...mcSkin };
export default all;
