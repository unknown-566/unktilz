import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { useParams } from 'react-router-dom';
import { UploadIcon } from './icons';
import { filesFromDrop, fitsAccept, isFileDrag, useDragged, usePendingFiles } from '../queue/dragFiles';

/**
 * Where a tool takes its files: drop them here (from the computer or from the queue) or press the
 * button. Every tool that starts from files uses this one, so it looks and works the same everywhere.
 */
export function DropZone({
  title,
  button,
  accept,
  onFiles,
  multiple,
  sub,
  note,
  error,
  more,
  inputRef,
  claimPending = true,
}: {
  title: ReactNode;
  button: string;
  /** Extensions with the dot (shown under the button unless `sub` says something else). */
  accept: string[];
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  sub?: ReactNode;
  note?: ReactNode;
  error?: string;
  /** Files are already in: smaller, and the button isn't the main one any more. */
  more?: boolean;
  /** To open the file picker from somewhere else. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Takes the files "Open in…" sent to this tool (off when the page takes them itself). */
  claimPending?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [dropError, setDropError] = useState('');
  const own = useRef<HTMLInputElement | null>(null);
  const { slug } = useParams();
  // Something from the queue that fits here is being dragged: show where it can go.
  const ready = useDragged((s) => !!s.dragged && s.dragged.names.some((n) => fitsAccept(n, accept)));
  const take = (list: FileList | File[] | null | undefined) => {
    const files = [...(list ?? [])];
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  usePendingFiles(claimPending ? slug : null, take);
  return (
    <div
      className={`drop${over ? ' over' : ''}${ready ? ' ready' : ''}${more ? ' more' : ''}`}
      // Taking it already on enter, so a quick release (before the first dragover) still lands.
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setOver(false);
        setDropError('');
        filesFromDrop(e).then(take, (err: Error) => setDropError(err.message));
      }}
    >
      {!more && (
        <span className="accent">
          <UploadIcon />
        </span>
      )}
      <div className="drop-title">{title}</div>
      <button type="button" className={more ? 'btn' : 'btn btn-primary'} onClick={() => own.current?.click()}>
        {button}
      </button>
      {sub !== null && <div className="drop-sub">{sub ?? accept.filter((a) => a.startsWith('.')).join(' ')}</div>}
      {note && <div className="drop-note">{note}</div>}
      {(error || dropError) && (
        <p className="drop-error" role="alert">
          {error || dropError}
        </p>
      )}
      <input
        ref={(el) => {
          own.current = el;
          if (inputRef) inputRef.current = el;
        }}
        type="file"
        hidden
        multiple={multiple}
        accept={accept.join(',')}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
