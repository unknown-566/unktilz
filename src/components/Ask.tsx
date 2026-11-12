import { useEffect, useRef, useSyncExternalStore } from 'react';
import { t } from '../lib/i18n-core';

/**
 * "Are you sure?" questions drawn by the site itself. window.confirm() isn't used: some browsers and
 * embedded views (like the Claude app's browser) block those dialogs and answer "no" at once.
 */
type Question = { text: string; yes: string; no: string; danger: boolean; resolve: (ok: boolean) => void };

let current: Question | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Asks a yes / no question on the page; resolves true for yes. A new question answers an open one with no. */
export function ask(text: string, opts: { yes?: string; no?: string; danger?: boolean } = {}): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = {
      text,
      yes: opts.yes ?? t('OK'),
      no: opts.no ?? t('cancel'),
      danger: opts.danger ?? false,
      resolve: (ok) => {
        current = null;
        notify();
        resolve(ok);
      },
    };
    notify();
  });
}

/** Shows the open question; put once near the root of the app. */
export function AskHost() {
  const q = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (q && d && !d.open) {
      d.showModal();
      d.querySelector<HTMLButtonElement>('.ask-foot button')?.focus();
    }
    if (!q && d?.open) d.close();
  }, [q]);

  return (
    <dialog
      ref={dialog}
      className="ask"
      aria-labelledby="ask-text"
      onCancel={(e) => {
        e.preventDefault();
        q?.resolve(false);
      }}
      onClick={(e) => e.target === dialog.current && q?.resolve(false)}
    >
      {q && (
        <div className="ask-body">
          <p id="ask-text">{q.text}</p>
          <div className="ask-foot">
            {/* "No" has the focus, so Enter never deletes anything by accident. */}
            <button type="button" className="btn" onClick={() => q.resolve(false)}>
              {q.no}
            </button>
            <button type="button" className={`btn ${q.danger ? 'ask-danger' : 'btn-primary'}`} onClick={() => q.resolve(true)}>
              {q.yes}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
