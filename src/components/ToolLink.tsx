import type { Tool } from '../registry';
import { preloadTool } from '../registry/preload';
import { CategoryIcon } from './icons';
import { ToolTags } from './ToolTags';
import { useLaunch } from './Transition';

/**
 * A small card that opens a tool: its category icon, name, tags and the short meta line under the
 * name. Used for related tools and for the suggestions on the "not found" page.
 */
export function ToolLink({ tool }: { tool: Tool }) {
  const launch = useLaunch();
  return (
    <a className="rel" href={`/t/${tool.slug}`} onClick={(e) => launch(e, tool.slug)} onMouseEnter={() => preloadTool(tool)} onFocus={() => preloadTool(tool)}>
      <span className="card-icon" aria-hidden="true">
        <CategoryIcon category={tool.category} />
      </span>
      <span className="rel-text">
        <span className="rel-name">
          {tool.name} <ToolTags tool={tool} />
        </span>
        {tool.meta && <span className="card-meta">{tool.meta}</span>}
      </span>
      <span className="rel-go" aria-hidden="true">
        →
      </span>
    </a>
  );
}
