// Password hashes: slow on purpose, with a random salt, so a stolen hash is hard to guess back.
// bcrypt and Argon2 use their usual encoded form ($2b$…, $argon2id$…); scrypt and PBKDF2 use the
// PHC form ($scrypt$ln=15,r=8,p=1$salt$hash) that passlib and others read.
import { argon2Verify, argon2d, argon2i, argon2id, bcrypt, bcryptVerify, createSHA256, createSHA512, pbkdf2, scrypt } from 'hash-wasm';
import { t } from '../../../lib/i18n-core';
import { equal, fromB64, random, utf8 } from './bytes';

export type PwAlgo = 'bcrypt' | 'argon2id' | 'argon2i' | 'argon2d' | 'scrypt' | 'pbkdf2-sha256' | 'pbkdf2-sha512';

export type PwParams = {
  /** bcrypt: cost 4–31. */
  cost?: number;
  /** Argon2: memory in KiB, passes, lanes. */
  memory?: number;
  passes?: number;
  lanes?: number;
  /** scrypt: N = 2^ln, r, p. */
  ln?: number;
  r?: number;
  p?: number;
  /** PBKDF2 rounds. */
  iterations?: number;
};

const b64 = (b: Uint8Array) => {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/=+$/, '');
};

export async function hashPassword(algo: PwAlgo, password: string, o: PwParams): Promise<string> {
  const salt = random(16);
  if (algo === 'bcrypt') {
    if (utf8(password).length > 72) throw new Error(t('bcrypt only uses the first 72 bytes of a password; pick Argon2id for longer ones.'));
    return bcrypt({ password, salt, costFactor: o.cost ?? 10, outputType: 'encoded' });
  }
  if (algo === 'argon2id' || algo === 'argon2i' || algo === 'argon2d') {
    const fn = { argon2id, argon2i, argon2d }[algo];
    return fn({ password, salt, memorySize: o.memory ?? 19456, iterations: o.passes ?? 2, parallelism: o.lanes ?? 1, hashLength: 32, outputType: 'encoded' });
  }
  if (algo === 'scrypt') {
    const ln = o.ln ?? 15, r = o.r ?? 8, p = o.p ?? 1;
    const h = await scrypt({ password, salt, costFactor: 2 ** ln, blockSize: r, parallelism: p, hashLength: 32, outputType: 'binary' });
    return `$scrypt$ln=${ln},r=${r},p=${p}$${b64(salt)}$${b64(h)}`;
  }
  const sha = algo === 'pbkdf2-sha512' ? 'sha512' : 'sha256';
  const i = o.iterations ?? (sha === 'sha512' ? 210_000 : 600_000);
  const h = await pbkdf2({ password, salt, iterations: i, hashLength: 32, hashFunction: sha === 'sha512' ? createSHA512() : createSHA256(), outputType: 'binary' });
  return `$pbkdf2-${sha}$i=${i}$${b64(salt)}$${b64(h)}`;
}

/** What kind of password hash this is, from its start. */
export function pwKind(hash: string): PwAlgo | null {
  const h = hash.trim();
  if (/^\$2[abxy]?\$\d\d\$[./A-Za-z0-9]{53}$/.test(h)) return 'bcrypt';
  const argon = /^\$(argon2id|argon2i|argon2d)\$/.exec(h);
  if (argon) return argon[1] as PwAlgo;
  if (h.startsWith('$scrypt$')) return 'scrypt';
  if (h.startsWith('$pbkdf2-sha256$')) return 'pbkdf2-sha256';
  if (h.startsWith('$pbkdf2-sha512$')) return 'pbkdf2-sha512';
  return null;
}

/** PHC parts: "$name$a=1,b=2$salt$hash"; passlib writes "." for "+" in its Base64. */
function phc(hash: string) {
  const parts = hash.trim().split('$');
  if (parts.length !== 5) throw new Error(t('That hash isn’t complete.'));
  // passlib writes PBKDF2 rounds as a bare number ($pbkdf2-sha256$29000$…).
  const params = Object.fromEntries(parts[2].split(',').map((kv) => (kv.includes('=') ? kv.split('=') : ['i', kv])).map(([k, v]) => [k, Number(v)]));
  const dec = (s: string) => fromB64(s.replace(/\./g, '+'));
  return { params, salt: dec(parts[3]), hash: dec(parts[4]) };
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const kind = pwKind(hash);
  const h = hash.trim();
  if (!kind) throw new Error(t('That doesn’t look like a bcrypt, Argon2, scrypt or PBKDF2 hash.'));
  if (kind === 'bcrypt') return bcryptVerify({ password, hash: h.replace(/^\$2[axy]?\$/, '$2b$') });
  if (kind.startsWith('argon2')) return argon2Verify({ password, hash: h });
  const { params, salt, hash: want } = phc(h);
  if (kind === 'scrypt') {
    const got = await scrypt({ password, salt, costFactor: 2 ** params.ln, blockSize: params.r, parallelism: params.p, hashLength: want.length, outputType: 'binary' });
    return equal(got, want);
  }
  const got = await pbkdf2({
    password,
    salt,
    iterations: params.i,
    hashLength: want.length,
    hashFunction: kind === 'pbkdf2-sha512' ? createSHA512() : createSHA256(),
    outputType: 'binary',
  });
  return equal(got, want);
}
