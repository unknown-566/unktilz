import { useState } from 'react';
import { t } from '../../../lib/i18n-core';

/** "Drop PDFs here or click": a big area the first time, a small button once pages are open. */
export function PdfDrop({ onFiles, multiple, compact, label }: { onFiles: (files: File[]) => void; multiple?: boolean; compact?: boolean; label: string }) {
  const [over, setOver] = useState(false);
  const take = (list: FileList | null | undefined) => {
    const files = [...(list ?? [])].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <label
      className={compact ? 'btn btn-sm' : `pg-drop${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        multiple={multiple}
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      {compact ? label : <b>{label}</b>}
      {!compact && <span className="note">{t('Everything stays on your computer.')}</span>}
    </label>
  );
}
