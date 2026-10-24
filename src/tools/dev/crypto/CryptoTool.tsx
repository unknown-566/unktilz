import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs } from '../../../components/ui';
import { t } from '../../../lib/i18n-core';
import { useAutosave } from '../../../lib/saved';
import ChainTab from './ChainTab';
import HashTab from './HashTab';
import PasswordTab from './PasswordTab';
import EncryptTab from './EncryptTab';
import type { Guess } from './detect';
import { usePendingFiles } from '../../../queue/dragFiles';

type Tab = 'chain' | 'hash' | 'password' | 'encrypt';

export default function CryptoTool() {
  const location = useLocation();
  // The old /t/base64 address opens here with Base64 picked.
  const start = (location.state as { opts?: { method?: string } } | null)?.opts?.method;
  const [tab, setTab] = useState<Tab>('chain');
  const [pwHash, setPwHash] = useState<string>();
  const [encText, setEncText] = useState<string>();
  const restored = useAutosave<Tab>('encode-encrypt:tab', tab, (v) => !start && setTab(v));
  // "Open in…" from the queue: the file goes into the first tab (after the saved tab is back).
  const [incoming, setIncoming] = useState<File>();
  usePendingFiles(restored ? 'encode-encrypt' : null, ([f]) => {
    setTab('chain');
    setIncoming(f);
  });

  // "Looks like a bcrypt hash / encrypted data" in the first tab opens the right tab with it.
  const onGuess = (g: Guess, text: string) => {
    if (g.kind === 'password') {
      setPwHash(text.trim());
      setTab('password');
    } else if (g.kind === 'encrypted') {
      setEncText(text.trim());
      setTab('encrypt');
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chain', label: t('Encode & ciphers') },
    { id: 'hash', label: t('Hashes') },
    { id: 'password', label: t('Password hashes') },
    { id: 'encrypt', label: t('Encryption') },
  ];
  return (
    <section className="panel cr" aria-label={t('Encode, encrypt & hash')}>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('Kind of work')} idPrefix="cr" />
      {/* All tabs stay mounted, so a picked file or typed text survives a switch. */}
      {tabs.map((x) => (
        <div key={x.id} className="tab-panel" role="tabpanel" id={`cr-panel-${x.id}`} aria-labelledby={`cr-tab-${x.id}`} hidden={tab !== x.id}>
          {x.id === 'chain' && <ChainTab start={start} onGuess={onGuess} incoming={incoming} />}
          {x.id === 'hash' && <HashTab />}
          {x.id === 'password' && <PasswordTab hashFromChain={pwHash} />}
          {x.id === 'encrypt' && <EncryptTab textFromChain={encText} />}
        </div>
      ))}
      <p className="note cr-privacy">{t('Everything runs in your browser: no text, file, password or key leaves your computer.')}</p>
    </section>
  );
}
