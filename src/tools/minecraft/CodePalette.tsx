import { MC_COLORS, MC_FORMATS, styleAtEnd, styleCodes } from '../../lib/mc/text';
import { t } from '../../lib/i18n-core';

/** Buttons that apply & codes to the selected text (or insert them at the cursor). */
export function CodePalette({ onInsert }: { onInsert: (code: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="seg compact" role="group" aria-label={t('Insert color')}>
        {MC_COLORS.map((c) => (
          <button
            key={c.code}
            type="button"
            aria-label={t('Insert {label} (&{code})', { label: c.label, code: c.code })}
            title={`${c.label} · &${c.code}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(`&${c.code}`)}
            style={{ minWidth: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="swatch" style={{ background: c.hex }} />
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label={t('Insert format')}>
        {MC_FORMATS.map((f) => (
          <button key={f.code} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(`&${f.code}`)} title={`&${f.code}`}>
            {f.label.toLowerCase()}
          </button>
        ))}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert('&r')} title="&r">
          {t('reset')}
        </button>
      </div>
    </div>
  );
}

/**
 * Applies a code the way a text editor applies formatting.
 * With text selected, only the selection changes: the code goes in front of it and the formatting
 * that was there before is restored right after it. With no selection the code is inserted at the cursor.
 */
export function applyCode(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, code: string, set: (v: string) => void) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  if (start === end) return insertAt(el, value, code, set);

  const selected = value.slice(start, end);
  const after = value.slice(end);
  let head = value.slice(0, start);
  // Measured on the untouched text: in "&l&fText" the &f already cancelled the bold.
  const before = styleAtEnd(head);
  const resume = styleAtEnd(value.slice(0, end));

  // A color code clears bold/italic/…, so a selection that was already bold stays bold.
  const isColor = /^&([0-9a-f]|#[0-9a-f]{6})$/i.test(code);
  // Codes right before the selection only affect the selection, and the new color replaces them
  // (formats are re-added below), so drop them instead of stacking codes on every click.
  if (isColor) head = head.replace(/(?:[&§](?:[0-9a-fk-or]|#[0-9a-f]{6}))+$/i, '');
  const open = isColor ? code + styleCodes({ ...before, color: undefined }) : code;

  // Nothing to restore at the very end, or when the next thing is a color/reset code anyway.
  const nextResets = /^[&§]([0-9a-fr]|#[0-9a-f]{6})/i.test(after);
  const close = !after || nextResets ? '' : resume.color ? styleCodes(resume) : `&r${styleCodes(resume)}`;

  set(head + open + selected + close + after);
  const from = head.length + open.length;
  // Keep the same words selected, so a second click (e.g. bold after a color) applies to them too.
  setTimeout(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(from, from + selected.length);
  }, 0);
}

/** Inserts text at the selection of a textarea/input and keeps the cursor after it. */
export function insertAt(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, text: string, set: (v: string) => void) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  set(next);
  setTimeout(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  }, 0);
}
