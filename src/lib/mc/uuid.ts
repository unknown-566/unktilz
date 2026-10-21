import { hex, md5 } from '../md5';
import { t } from '../i18n-core';

export const dashed = (raw: string) => {
  const h = raw.replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/** The UUID an offline-mode server gives a player: name-based v3 of "OfflinePlayer:<name>". */
export function offlineUuid(name: string) {
  const b = md5(new TextEncoder().encode(`OfflinePlayer:${name}`));
  b[6] = (b[6] & 0x0f) | 0x30;
  b[8] = (b[8] & 0x3f) | 0x80;
  return dashed(hex(b));
}

/** NBT int-array form used by commands since 1.16: [I;a,b,c,d] */
export function intArray(uuid: string) {
  const h = uuid.replace(/-/g, '');
  const ints = [0, 8, 16, 24].map((i) => parseInt(h.slice(i, i + 8), 16) | 0);
  return `[I;${ints.join(',')}]`;
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s.trim());
export const isName = (s: string) => /^[A-Za-z0-9_]{1,16}$/.test(s.trim());

export type Profile = { name: string; id: string };

export type SkinInfo = { name: string; url: string; slim: boolean };

/** A player's current skin texture (straight from Mojang's texture server) and arm model. */
export async function lookupSkin(query: string): Promise<SkinInfo | null> {
  const res = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(query.trim())}`);
  type Body = { success?: boolean; data?: { player?: { username: string; skin_texture?: string; properties?: { name: string; value: string }[] } } };
  const body = (await res.json().catch(() => null)) as Body | null;
  const p = body?.success ? body.data?.player : null;
  if (!p) {
    if (res.status >= 500) throw new Error(t('The lookup service is having trouble. Try again in a minute.'));
    return null;
  }
  let url = p.skin_texture ?? '';
  let slim = false;
  const tex = p.properties?.find((x) => x.name === 'textures');
  if (tex) {
    try {
      const skin = JSON.parse(atob(tex.value)).textures?.SKIN;
      if (skin?.url) url = skin.url;
      slim = skin?.metadata?.model === 'slim';
    } catch {
      /* keep what playerdb gave */
    }
  }
  if (!url) return null;
  return { name: p.username, url: url.replace(/^http:/, 'https:'), slim };
}

/** Looks up a Java profile by name or UUID (playerdb.co proxies Mojang with CORS). */
export async function lookupProfile(query: string): Promise<Profile | null> {
  const res = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(query.trim())}`);
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: { player?: { username: string; id: string } } } | null;
  if (!body?.success || !body.data?.player) {
    if (res.status >= 500) throw new Error(t('The lookup service is having trouble. Try again in a minute.'));
    return null;
  }
  return { name: body.data.player.username, id: dashed(body.data.player.id) };
}
