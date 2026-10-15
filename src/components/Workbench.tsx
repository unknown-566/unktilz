import type { ReactNode } from 'react';

/** Editor on the left, preview (and output) on the right in a column that stays on screen while the editor scrolls. */
export function Workbench({ preview, output, children }: { preview: ReactNode; output?: ReactNode; children: ReactNode }) {
  return (
    <div className="workbench">
      <div className="wb-main">{children}</div>
      <div className="wb-side">
        <div className="wb-preview">{preview}</div>
        {output && <div className="wb-output">{output}</div>}
      </div>
    </div>
  );
}
