import { NEW_DAYS, isNew, type Tool } from '../registry';
import { Help } from './Help';

/** "new" (for NEW_DAYS after a tool came out) and "beta" tags; nothing when neither applies. */
export function ToolTags({ tool, explain }: { tool: Pick<Tool, 'added' | 'beta'>; explain?: boolean }) {
  const fresh = isNew(tool);
  if (!fresh && !tool.beta) return null;
  return (
    <>
      {fresh && (
        <span className="tool-tag tool-new" title={`Added in the last ${NEW_DAYS} days`}>
          new
        </span>
      )}
      {tool.beta && (
        <span className="tool-tag tool-beta" title="Still being tested">
          beta
        </span>
      )}
      {tool.beta && explain && <Help label="Beta" text="Still being tested: something may not work right yet. If something breaks, tell us via “Request a tool” at the top." />}
    </>
  );
}
