import { unzipSync } from 'fflate';
import type { Report } from '../compute.worker';
import { t } from '../../lib/i18n-core';

export type JarAssetsPayload = { jar: Blob };
export type JarAssetsResult = { versionJson: string | null; files: Record<string, Uint8Array>; bytes: number };

/**
 * What a resource pack can change or needs to read, from assets/minecraft/: textures, models,
 * item definitions, block states, texture atlases, texts (splashes) and the English language file.
 * The rest of the jar (code, shaders, about 85% of it) is left out.
 */
const KEEP = ['textures/', 'models/', 'items/', 'blockstates/', 'atlases/', 'texts/', 'equipment/', 'lang/en_us.json'];
const PREFIX = 'assets/minecraft/';

/** Takes a Minecraft client jar apart and keeps only what the resource pack maker uses. */
export async function jarAssets({ jar }: JarAssetsPayload, report: Report): Promise<JarAssetsResult> {
  report(0.1);
  const data = new Uint8Array(await jar.arrayBuffer());
  report(0.3);
  let all: Record<string, Uint8Array>;
  try {
    all = unzipSync(data, {
      filter: (f) => f.name === 'version.json' || (f.name.startsWith(PREFIX) && !f.name.endsWith('/') && KEEP.some((k) => f.name.startsWith(PREFIX + k))),
    });
  } catch {
    throw new Error(t('This isn’t a Minecraft game file (.jar), or it’s damaged.'));
  }
  report(0.9);
  const files: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const [name, bytesOf] of Object.entries(all)) {
    if (name === 'version.json') continue;
    files[name.slice(PREFIX.length)] = bytesOf;
    bytes += bytesOf.length;
  }
  if (!Object.keys(files).some((f) => f.startsWith('textures/'))) throw new Error(t('No textures in this file. Pick the game’s own .jar from .minecraft/versions/<version>/.'));
  const versionJson = all['version.json'] ? new TextDecoder().decode(all['version.json']) : null;
  return { versionJson, files, bytes };
}
