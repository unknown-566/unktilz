import { useState } from 'react';
import { DropZone } from '../../../components/DropZone';
import { t } from '../../../lib/i18n-core';

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/** Where the PDF tools take their PDFs: the site's drop zone the first time, a small button once pages are open. */
export function PdfDrop({ onFiles, multiple, compact, label, note, claimPending }: { onFiles: (files: File[]) => void; multiple?: boolean; compact?: boolean; label: string; note?: string; claimPending?: boolean }) {
  const [error, setError] = useState('');
  const take = (list: FileList | File[] | null | undefined) => {
    const all = [...(list ?? [])];
    const files = all.filter(isPdf);
    setError(files.length < all.length ? t('Only PDF files go here; the other files were left out.') : '');
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  if (!compact)
    return <DropZone title={label} button={multiple ? t('Choose PDFs') : t('Choose a PDF')} accept={['.pdf']} multiple={multiple} note={note} error={error} onFiles={take} claimPending={claimPending} />;
  return (
    <label className="btn btn-sm">
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
      {label}
    </label>
  );
}
