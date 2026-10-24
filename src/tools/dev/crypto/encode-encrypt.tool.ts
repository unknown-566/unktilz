import { defineTool, lazyTool } from '../../../registry/types';
import { t } from '../../../lib/i18n-core';

export default defineTool({
  slug: 'encode-encrypt',
  name: t('Encode, encrypt & hash'),
  category: 'dev',
  order: 4,
  meta: t('Base64 · XOR · AES · SHA-256'),
  added: '2026-10-24',
  accepts: ['*'],
  layout: 'workbench',
  description: t(
    'Every way to encode, encrypt and hash: Base64, hex, URL, Morse and more, classic ciphers (Caesar, Vigenère, XOR…) you can chain, MD5 / SHA / BLAKE3 of text or files, bcrypt and Argon2 password hashes, and real encryption with a password (AES-256-GCM, OpenSSL compatible).',
  ),
  keywords: [
    'base64', 'encode', 'decode', 'b64', 'data url', 'base32', 'base58', 'base85', 'hex', 'binary', 'url encode', 'html entities', 'unicode escape', 'punycode', 'morse',
    'cipher', 'caesar', 'rot13', 'vigenere', 'atbash', 'xor', 'playfair', 'ctf', 'cyberchef', 'hash', 'md5', 'sha1', 'sha256', 'sha512', 'sha3', 'blake3', 'crc32', 'checksum', 'hmac',
    'bcrypt', 'argon2', 'scrypt', 'pbkdf2', 'password hash', 'encrypt', 'decrypt', 'aes', 'chacha20', 'openssl', 'encryption',
  ],
  component: lazyTool(() => import('./CryptoTool')),
});
