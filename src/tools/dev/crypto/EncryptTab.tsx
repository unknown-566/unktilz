import { useEffect, useMemo, useState } from 'react';
import { CopyButton, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { fmtNum, t } from '../../../lib/i18n-core';
import { useAutosave } from '../../../lib/saved';
import { formatBytes, saveBlob } from '../../../queue/download';
import { fromB64, fromHex, random, toB64, toHex } from './bytes';
import { Cancelled, cryptoJob } from './cryptoClient';
import { DEFAULT_ARGON, DEFAULT_PBKDF2, RAW_INFO, describeUnktilz, isOpenSsl, isUnktilz, type Kdf, type PwCipher, type RawAlgo } from './encrypt';
import { BytesOutput, DataInput, readSource, type Source } from './io';

type Way = 'password' | 'key';
type Format = PwCipher | 'openssl';
type Saved = { way: Way; decrypt: boolean; format: Format; kdf: 'argon2id' | 'pbkdf2'; iterations: number; raw: RawAlgo; rawIn: 'hex' | 'base64'; text: string };

const FORMATS: { value: Format; label: string }[] = [
  { value: 'aes-256-gcm', label: t('AES-256-GCM (recommended)') },
  { value: 'xchacha20-poly1305', label: 'XChaCha20-Poly1305' },
  { value: 'openssl', label: t('OpenSSL compatible (AES-256-CBC)') },
];

/** What the ciphertext text box holds: our Base64, or hex / Base64 bytes for your own key. */
function encodedBytes(s: string, as: 'hex' | 'base64') {
  return as === 'hex' ? fromHex(s) : fromB64(s);
}

export default function EncryptTab({ textFromChain }: { textFromChain?: string }) {
  const [way, setWay] = useState<Way>('password');
  const [decrypt, setDecrypt] = useState(!!textFromChain);
  const [format, setFormat] = useState<Format>('aes-256-gcm');
  const [kdf, setKdf] = useState<'argon2id' | 'pbkdf2'>('argon2id');
  const [iterations, setIterations] = useState(10_000);
  const [raw, setRaw] = useState<RawAlgo>('aes-gcm');
  const [rawIn, setRawIn] = useState<'hex' | 'base64'>('base64');
  const [text, setText] = useState(textFromChain ?? '');
  const [source, setSource] = useState<Source>({ kind: 'text' });
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [key, setKey] = useState('');
  const [nonce, setNonce] = useState('');
  const [result, setResult] = useState<{ bytes: Uint8Array; decrypted: boolean } | null>(null);
  const [busy, setBusy] = useState<(() => void) | null>(null);
  const [error, setError] = useState('');
  const [header, setHeader] = useState<string>('');
  // Passwords and keys are never saved.
  useAutosave<Saved>('encode-encrypt:encrypt', { way, decrypt, format, kdf, iterations, raw, rawIn, text: text.length < 20_000 ? text : '' }, (v) => {
    setWay(v.way ?? 'password');
    if (!textFromChain) {
      setDecrypt(!!v.decrypt);
      setText(v.text ?? '');
    }
    setFormat(v.format ?? 'aes-256-gcm');
    setKdf(v.kdf ?? 'argon2id');
    setIterations(v.iterations || 10_000);
    if (v.raw && RAW_INFO[v.raw]) setRaw(v.raw);
    setRawIn(v.rawIn ?? 'base64');
  });
  useEffect(() => {
    if (textFromChain) {
      setText(textFromChain);
      setSource({ kind: 'text' });
      setDecrypt(true);
      setWay('password');
    }
  }, [textFromChain]);
  useEffect(() => {
    setResult(null);
    setError('');
  }, [way, decrypt, format, kdf, raw, text, source]);

  const info = RAW_INFO[raw];
  // A text to decrypt says what it was made with: show it before asking for the password.
  useEffect(() => {
    setHeader('');
    if (way !== 'password' || !decrypt) return;
    let alive = true;
    void readInput().then(
      (b) => {
        if (!alive) return;
        const d = describeUnktilz(b);
        if (d)
          setHeader(
            t('Encrypted here with {cipher}, key from {kdf}.', {
              cipher: d.cipher === 'aes-256-gcm' ? 'AES-256-GCM' : 'XChaCha20-Poly1305',
              kdf: d.kdf.type === 'argon2id' ? `Argon2id (${fmtNum(Math.round(d.kdf.memory / 1024))} MiB, ${d.kdf.passes}×)` : `PBKDF2-SHA256 (${fmtNum(d.kdf.iterations)}×)`,
            }),
          );
        else if (isOpenSsl(b)) setHeader(t('OpenSSL data (AES-256-CBC with PBKDF2): set the rounds it was made with below.'));
      },
      () => {},
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [way, decrypt, text, source]);

  /** The bytes to work on: a file as it is, the text box as text (encrypt) or as Base64 / hex (decrypt). */
  async function readInput(): Promise<Uint8Array> {
    if (!decrypt) return readSource(source, text);
    if (source.kind === 'file') {
      const b = new Uint8Array(await source.file.arrayBuffer());
      // A .enc file saved as Base64 text works too.
      if (way === 'password' && !isUnktilz(b) && !isOpenSsl(b)) {
        try {
          const inner = fromB64(new TextDecoder().decode(b));
          if (isUnktilz(inner) || isOpenSsl(inner)) return inner;
        } catch {
          /* not Base64 */
        }
      }
      return b;
    }
    return way === 'password' ? fromB64(text) : encodedBytes(text, rawIn);
  }

  const run = async () => {
    setError('');
    setResult(null);
    let data: Uint8Array;
    try {
      data = await readInput();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    let job;
    if (way === 'password') {
      if (!decrypt && password !== again) return setError(t('The two passwords aren’t the same.'));
      const k: Kdf = kdf === 'argon2id' ? DEFAULT_ARGON : DEFAULT_PBKDF2;
      job = cryptoJob<Uint8Array>(decrypt ? { type: 'decrypt', data, password, iterations } : { type: 'encrypt', data, password, format, kdf: k, iterations });
    } else {
      let k: Uint8Array, n: Uint8Array;
      try {
        k = fromHex(key, t('hex key'));
        n = info.nonce ? fromHex(nonce, 'IV / nonce') : new Uint8Array(0);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      job = cryptoJob<Uint8Array>({ type: 'raw', algo: raw, key: k, nonce: n, data, decrypt });
    }
    setBusy(() => job.cancel);
    job.done.then(
      (bytes) => {
        setBusy(null);
        setResult({ bytes, decrypted: decrypt });
      },
      (e) => {
        setBusy(null);
        if (!(e instanceof Cancelled)) setError((e as Error).message);
      },
    );
  };

  const randomKey = () => {
    setKey(toHex(random(raw === 'rc4' ? 16 : info.keys[info.keys.length - 1])));
    if (info.nonce) setNonce(toHex(random(info.nonce)));
  };
  const strength = useMemo(() => passwordStrength(password), [password]);
  const baseName = source.kind === 'file' ? source.file.name : 'message';

  return (
    <div className="cr-tab">
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <Segmented
          label={t('Direction')}
          value={decrypt ? 'decrypt' : 'encrypt'}
          onChange={(v) => setDecrypt(v === 'decrypt')}
          options={[
            { value: 'encrypt', label: t('encrypt') },
            { value: 'decrypt', label: t('decrypt') },
          ]}
        />
        <Segmented
          label={t('With')}
          value={way}
          onChange={setWay}
          options={[
            { value: 'password', label: t('a password') },
            { value: 'key', label: t('my own key') },
          ]}
        />
      </div>

      <DataInput
        label={decrypt ? (way === 'password' ? t('Encrypted text (Base64) or file') : rawIn === 'hex' ? t('Encrypted data (hex) or file') : t('Encrypted data (Base64) or file')) : t('Text or file to encrypt')}
        text={text}
        onText={setText}
        source={source}
        onSource={setSource}
        rows={5}
      />
      {header && <p className="note">{header}</p>}

      {way === 'password' ? (
        <>
          <div className="cr-step-opts">
            {!decrypt && (
              <span className="cr-opt">
                <span className="cr-opt-label">
                  <label htmlFor="cr-enc-format">{t('Cipher')}</label>
                  <Help
                    label={t('Cipher')}
                    text={t('AES-256-GCM and XChaCha20-Poly1305 are both modern and safe, and they notice if anyone changes the data. Pick OpenSSL when the other side decrypts on the command line.')}
                  />
                </span>
                <select id="cr-enc-format" className="select" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </span>
            )}
            {!decrypt && format !== 'openssl' && (
              <span className="cr-opt">
                <span className="cr-opt-label">
                  <label htmlFor="cr-enc-kdf">{t('Key from the password')}</label>
                  <Help
                    label={t('Key from the password')}
                    text={t('Argon2id (64 MiB, 3 passes) makes every guess slow and memory-hungry; PBKDF2 (600 000 rounds) is the older standard. The settings are saved with the data, so only the password is needed to decrypt.')}
                  />
                </span>
                <select id="cr-enc-kdf" className="select" value={kdf} onChange={(e) => setKdf(e.target.value as 'argon2id' | 'pbkdf2')}>
                  <option value="argon2id">{t('Argon2id (recommended)')}</option>
                  <option value="pbkdf2">PBKDF2-SHA256</option>
                </select>
              </span>
            )}
            {(format === 'openssl' || decrypt) && (
              <span className="cr-opt">
                <span className="cr-opt-label">
                  <label htmlFor="cr-enc-iter">{t('OpenSSL rounds (-iter)')}</label>
                  <Help label={t('OpenSSL rounds (-iter)')} text={t('OpenSSL uses 10 000 when -iter isn’t given. Only used for OpenSSL data.')} />
                </span>
                <input id="cr-enc-iter" className="input mono cr-num" type="number" min={1} value={iterations} onChange={(e) => setIterations(Math.max(1, Number(e.target.value) || 1))} />
              </span>
            )}
          </div>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label htmlFor="cr-enc-pw">{t('Password')}</label>
              <button type="button" className="btn btn-sm mono" onClick={() => setShow(!show)}>
                {show ? t('hide') : t('show')}
              </button>
            </span>
            <input id="cr-enc-pw" className="input mono" type={show ? 'text' : 'password'} value={password} autoComplete="new-password" spellCheck={false} onChange={(e) => setPassword(e.target.value)} />
            {!decrypt && password && <p className={`note cr-strength s${strength.level}`}>{strength.label}</p>}
          </div>
          {!decrypt && (
            <div className="field">
              <label htmlFor="cr-enc-pw2">{t('Password again')}</label>
              <input id="cr-enc-pw2" className="input mono" type={show ? 'text' : 'password'} value={again} autoComplete="new-password" spellCheck={false} onChange={(e) => setAgain(e.target.value)} />
            </div>
          )}
          {/* i18n-ignore: a command */}
          {!decrypt && format === 'openssl' && <p className="note mono cr-cmd">openssl enc -d -aes-256-cbc -pbkdf2 -iter {iterations} -a -in message.txt</p>}
        </>
      ) : (
        <>
          <div className="cr-step-opts">
            <span className="cr-opt">
              <span className="cr-opt-label">
                <label htmlFor="cr-raw-algo">{t('Cipher')}</label>
              </span>
              <select id="cr-raw-algo" className="select" value={raw} onChange={(e) => setRaw(e.target.value as RawAlgo)}>
                {(Object.keys(RAW_INFO) as RawAlgo[]).map((a) => (
                  <option key={a} value={a}>
                    {RAW_INFO[a].name}
                    {RAW_INFO[a].old ? ` · ${t('outdated')}` : ''}
                  </option>
                ))}
              </select>
            </span>
            {decrypt && source.kind === 'text' && (
              <span className="cr-opt">
                <span className="cr-opt-label">
                  <label htmlFor="cr-raw-in">{t('Data is written as')}</label>
                </span>
                <select id="cr-raw-in" className="select" value={rawIn} onChange={(e) => setRawIn(e.target.value as 'hex' | 'base64')}>
                  <option value="base64">Base64</option>
                  <option value="hex">hex</option>
                </select>
              </span>
            )}
          </div>
          <div className="field">
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label htmlFor="cr-raw-key">{raw === 'rc4' ? t('Key (hex, 1–256 bytes)') : t('Key (hex, {sizes} bytes)', { sizes: info.keys.join(' / ') })}</label>
              <button type="button" className="btn btn-sm mono" onClick={randomKey}>
                {t('random key')}
              </button>
            </span>
            <input id="cr-raw-key" className="input mono" value={key} spellCheck={false} autoComplete="off" onChange={(e) => setKey(e.target.value)} />
          </div>
          {info.nonce > 0 && (
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <label htmlFor="cr-raw-iv" className="field-label">
                    {t('IV / nonce (hex, {size} bytes)', { size: info.nonce })}
                  </label>
                  <Help label="IV / nonce" text={t('Never use the same key and nonce twice for different messages: with CTR, ChaCha20 or GCM that gives the secret away.')} />
                </span>
                <button type="button" className="btn btn-sm mono" onClick={() => setNonce(toHex(random(info.nonce)))}>
                  {t('random')}
                </button>
              </span>
              <input id="cr-raw-iv" className="input mono" value={nonce} spellCheck={false} autoComplete="off" onChange={(e) => setNonce(e.target.value)} />
            </div>
          )}
          {info.old && (
            <p className="note">{raw === 'rc4' ? t('RC4 is broken: only for old data and puzzles.') : t('ECB encrypts equal blocks to equal blocks, so patterns show through: only for old data and puzzles.')}</p>
          )}
        </>
      )}

      <div className="inline">
        {busy ? (
          <>
            <span className="mono muted">{way === 'password' ? t('making the key from the password…') : t('working…')}</span>
            <button type="button" className="btn btn-sm" onClick={busy}>
              {t('stop')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={(source.kind === 'text' && !text) || (way === 'password' ? !password : !key)}
            onClick={() => void run()}
          >
            {decrypt ? t('Decrypt') : t('Encrypt')}
          </button>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {result &&
        (result.decrypted ? (
          <BytesOutput label={t('Decrypted')} bytes={result.bytes} fileName={source.kind === 'file' ? baseName.replace(/\.enc$/i, '') || 'decrypted' : 'decrypted.txt'} />
        ) : (
          <EncryptedOut bytes={result.bytes} name={baseName} openssl={way === 'password' && format === 'openssl'} raw={way === 'key'} />
        ))}
    </div>
  );
}

function EncryptedOut({ bytes, name, openssl, raw }: { bytes: Uint8Array; name: string; openssl: boolean; raw: boolean }) {
  const [as, setAs] = useState<'base64' | 'hex'>('base64');
  const text = useMemo(() => {
    if (bytes.length > 300_000) return '';
    if (raw && as === 'hex') return toHex(bytes);
    const b = toB64(bytes);
    // openssl -a reads lines of at most 64 characters.
    return openssl ? b.replace(/.{64}(?=.)/g, '$&\n') : b;
  }, [bytes, openssl, raw, as]);
  return (
    <div className="field">
      <div className="cr-input-head">
        <span className="field-label">
          {t('Encrypted')} <span className="muted mono">· {formatBytes(bytes.length)}</span>
        </span>
        <span className="cr-input-actions">
          {raw && <Segmented compact label={t('Show as')} value={as} onChange={setAs} options={[{ value: 'base64', label: 'Base64' }, { value: 'hex', label: 'hex' }]} />}
          <button type="button" className="btn btn-sm mono" onClick={() => saveBlob(new Blob([bytes as BlobPart]), `${name}.enc`)}>
            {t('download .enc')}
          </button>
        </span>
      </div>
      {text ? (
        <>
          <div className="out">
            <pre className="cr-pre">{text}</pre>
            <CopyButton text={text} />
          </div>
          <p className="note">{raw ? t('Keep the key and the IV / nonce: without them nobody can read it, not even you.') : t('Send this text or the .enc file; the other side needs the same password.')}</p>
        </>
      ) : (
        <p className="note">{t('Too big to show as text: download the .enc file.')}</p>
      )}
    </div>
  );
}

/** A rough guide, not a promise: length and kinds of characters. */
function passwordStrength(p: string): { level: 0 | 1 | 2 | 3; label: string } {
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(p)).length;
  const len = [...p].length;
  const bits = len * Math.log2(Math.max(10, [0, 26, 52, 62, 94][kinds]));
  if (bits < 40) return { level: 0, label: t('Weak password: easy to guess. Use a longer one, best a few random words.') };
  if (bits < 60) return { level: 1, label: t('So-so password: OK for little things.') };
  if (bits < 80) return { level: 2, label: t('Good password.') };
  return { level: 3, label: t('Strong password.') };
}

