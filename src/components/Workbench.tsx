import { useState, type ReactNode } from 'react';

/**
 * Editor on the left, preview (and output) on the right in a column that stays on screen while
 * the editor scrolls. On narrow screens it stacks: the preview either sticks to the top (short
 * previews, with a hide button) or sits after the editor (tall ones), and the output comes last.
 */
export function Workbench({
  preview,
  output,
  children,
  mobile = 'sticky',
}: {
  preview: ReactNode;
  output?: ReactNode;
  children: ReactNode;
  mobile?: 'sticky' | 'below';
}) {
  const [hidden, setHidden] = useState(false);
  return (
    <div className={`workbench${mobile === 'below' ? ' wb-mobile-below' : ''}`}>
      <div className="wb-main">{children}</div>
      <div className="wb-side">
        <div className="wb-preview">
          {mobile === 'sticky' && (
            <button type="button" className="wb-toggle rail-ghost" aria-expanded={!hidden} onClick={() => setHidden(!hidden)}>
              {hidden ? 'show preview' : 'hide preview'}
            </button>
          )}
          <div className={hidden ? 'wb-hidden' : undefined}>{preview}</div>
        </div>
        {output && <div className="wb-output">{output}</div>}
      </div>
    </div>
  );
}
