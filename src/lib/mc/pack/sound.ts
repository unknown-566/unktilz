import { ffmpegRun } from '../../ffmpeg';
import { ffTime } from '../../timecode';

/**
 * A sound file the way Minecraft plays it: Ogg Vorbis, 44.1 kHz. Sounds placed in the world must be
 * mono, or the game can't tell where they come from (they'd play at full volume everywhere); music
 * stays stereo.
 */
export async function toMinecraftOgg(
  file: File,
  o: { start: number; end: number | null; volume: number; mono: boolean },
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'bin').toLowerCase();
  const input = `in.${ext}`;
  const args = ['-i', input];
  if (o.start > 0) args.push('-ss', ffTime(o.start));
  if (o.end !== null && o.end > o.start) args.push('-to', ffTime(o.end));
  args.push('-vn', '-map_metadata', '-1', '-ac', o.mono ? '1' : '2', '-ar', '44100');
  if (o.volume !== 100) args.push('-af', `volume=${(o.volume / 100).toFixed(2)}`);
  args.push('-c:a', 'libvorbis', '-q:a', '4', 'out.ogg');
  const [ogg] = await ffmpegRun([{ name: input, data: new Uint8Array(await file.arrayBuffer()) }], args, ['out.ogg'], { signal, onProgress });
  return ogg;
}
