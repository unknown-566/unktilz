import { useEffect, useState } from 'react';
import { Output, Segmented } from '../../../components/ui';
import { Help } from '../../../components/Help';
import { fmtNum, t } from '../../../lib/i18n-core';
import { useAutosave } from '../../../lib/saved';
import { Cancelled, cryptoJob } from './cryptoClient';
import { pwKind, type PwAlgo, type PwParams } from './passwords';

type Mode = 'create' | 'verify';
type Saved = { mode: Mode; algo: PwAlgo; params: PwParams };

const ALGOS: { value: PwAlgo; label: string }[] = [
  { value: 'argon2id', label: t('Argon2id (recommended)') },
  { value: 'bcrypt', label: 'bcrypt' },
  { value: 'scrypt', label: 'scrypt' },
  { value: 'pbkdf2-sha256', label: 'PBKDF2-SHA256' },
  { value: 'pbkdf2-sha512', label: 'PBKDF2-SHA512' },
  { value: 'argon2i', label: 'Argon2i' },
  { value: 'argon2d', label: 'Argon2d' },
];

/** Settings OWASP recommends (2024). */
const DEFAULTS: Record<PwAlgo, PwParams> = {
  argon2id: { memory: 19456, passes: 2, lanes: 1 },
  argon2i: { memory: 19456, passes: 2, lanes: 1 },
  argon2d: { memory: 19456, passes: 2, lanes: 1 },
  bcrypt: { cost: 10 },
  scrypt: { ln: 17, r: 8, p: 1 },
  'pbkdf2-sha256': { iterations: 600_000 },
  'pbkdf2-sha512': { iterations: 210_000 },
};

export default function PasswordTab({ hashFromChain }: { hashFromChain?: string }) {
  const [mode, setMode] = useState<Mode>(hashFromChain ? 'verify' : 'create');
  const [algo, setAlgo] = useState<PwAlgo>('argon2id');
  const [params, setParams] = useState<PwParams>(DEFAULTS.argon2id);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [hash, setHash] = useState(hashFromChain ?? '');
  const [made, setMade] = useState<{ hash: string; ms: number } | null>(null);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<(() => void) | null>(null);
  const [error, setError] = useState('');
  // The password itself is never saved.
  useAutosave<Saved>('encode-encrypt:password', { mode, algo, params }, (v) => {
    if (!hashFromChain) setMode(v.mode ?? 'create');
    if (v.algo && DEFAULTS[v.algo]) {
      setAlgo(v.algo);
      setParams({ ...DEFAULTS[v.algo], ...v.params });
    }
  });
  useEffect(() => {
    if (hashFromChain) {
      setHash(hashFromChain);
      setMode('verify');
    }
  }, [hashFromChain]);
  useEffect(() => {
    setVerdict(null);
    setError('');
  }, [password, hash, mode]);

  const run = () => {
    setError('');
    setMade(null);
    setVerdict(null);
    const started = performance.now();
    const job =
      mode === 'create'
        ? cryptoJob<string>({ type: 'pw-hash', algo, password, params })
        : cryptoJob<boolean>({ type: 'pw-verify', password, hash });
    setBusy(() => job.cancel);
    job.done.then(
      (r) => {
        setBusy(null);
        if (mode === 'create') setMade({ hash: r as string, ms: performance.now() - started });
        else setVerdict(r as boolean);
      },
      (e) => {
        setBusy(null);
        if (!(e instanceof Cancelled)) setError((e as Error).message);
      },
    );
  };

  const num = (key: keyof PwParams, label: string, min: number, max: number, help?: string) => (
    <span className="cr-opt">
      <span className="cr-opt-label">
        <label htmlFor={`cr-pw-${key}`}>{label}</label>
        {help && <Help label={label} text={help} />}
      </span>
      <input
        id={`cr-pw-${key}`}
        className="input mono cr-num"
        type="number"
        min={min}
        max={max}
        value={params[key] ?? ''}
        onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
        onBlur={() => setParams({ ...params, [key]: Math.min(max, Math.max(min, Math.round(params[key] ?? min) || min)) })}
      />
    </span>
  );
  const kind = pwKind(hash);

  return (
    <div className="cr-tab">
      <p className="note">
        {t('Websites store a password as a slow hash with a random salt, never as the password itself. Here you can make one or check if a password belongs to a hash.')}
      </p>
      <Segmented
        label={t('What to do')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: t('make a hash') },
          { value: 'verify', label: t('check a password') },
        ]}
      />

      {mode === 'create' && (
        <div className="cr-step-opts cr-pw-opts">
          <span className="cr-opt">
            <span className="cr-opt-label">
              <label htmlFor="cr-pw-algo">{t('Method')}</label>
            </span>
            <select
              id="cr-pw-algo"
              className="select"
              value={algo}
              onChange={(e) => {
                const a = e.target.value as PwAlgo;
                setAlgo(a);
                setParams(DEFAULTS[a]);
              }}
            >
              {ALGOS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </span>
          {algo === 'bcrypt' && num('cost', t('Cost'), 4, 16, t('Each +1 doubles the time. 10–12 is usual.'))}
          {algo.startsWith('argon2') && (
            <>
              {num('memory', t('Memory (KiB)'), 1024, 1_048_576, t('How much memory one try needs: makes guessing on graphics cards expensive. 19456 KiB = 19 MiB.'))}
              {num('passes', t('Passes'), 1, 20)}
              {num('lanes', t('Lanes'), 1, 8)}
            </>
          )}
          {algo === 'scrypt' && (
            <>
              {num('ln', t('Cost (N = 2^…)'), 10, 20, t('17 means N = 131072 (128 MiB with r = 8).'))}
              {num('r', 'r', 1, 32)}
              {num('p', 'p', 1, 16)}
            </>
          )}
          {algo.startsWith('pbkdf2') && num('iterations', t('Rounds'), 1000, 10_000_000)}
        </div>
      )}

      <div className="field">
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label htmlFor="cr-pw">{t('Password')}</label>
          <button type="button" className="btn btn-sm mono" onClick={() => setShow(!show)}>
            {show ? t('hide') : t('show')}
          </button>
        </span>
        <input id="cr-pw" className="input mono" type={show ? 'text' : 'password'} value={password} autoComplete="off" spellCheck={false} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {mode === 'verify' && (
        <div className="field">
          <label htmlFor="cr-pw-hash">{t('Hash')}</label>
          {/* i18n-ignore */}
          <input id="cr-pw-hash" className="input mono" value={hash} placeholder="$2b$10$… / $argon2id$v=19$…" spellCheck={false} autoComplete="off" onChange={(e) => setHash(e.target.value)} />
          {hash.trim() && <p className={kind ? 'note' : 'error-text'}>{kind ? t('Recognised: {kind}', { kind }) : t('That doesn’t look like a bcrypt, Argon2, scrypt or PBKDF2 hash.')}</p>}
        </div>
      )}

      <div className="inline">
        {busy ? (
          <>
            <span className="mono muted">{mode === 'create' ? t('hashing… (slow on purpose)') : t('checking…')}</span>
            <button type="button" className="btn btn-sm" onClick={busy}>
              {t('stop')}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!password || (mode === 'verify' && !kind)} onClick={run}>
            {mode === 'create' ? t('Make the hash') : t('Check')}
          </button>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {made && (
        <>
          <Output label={t('Hash')} value={made.hash} />
          <p className="note">{t('Took {ms} ms. Every run gives a different hash (a new random salt), and all of them fit the same password.', { ms: fmtNum(Math.round(made.ms)) })}</p>
        </>
      )}
      {verdict !== null && (
        <p className={verdict ? 'cr-ok cr-verdict' : 'error-text cr-verdict'} role="status">
          {verdict ? t('✓ The password matches the hash.') : t('✗ The password doesn’t match.')}
        </p>
      )}
    </div>
  );
}
