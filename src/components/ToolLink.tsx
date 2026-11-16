import type { Tool } from '../registry';
import { preloadTool } from '../registry/preload';
import { ToolIcon } from './toolArt';
import { ToolTags } from './ToolTags';
import { useLaunch } from './Transition';

/**
 * A small card that opens a tool: its category icon, name, tags and the short meta line under the
 * name. Used for related tools and for the suggestions on the "not found" page.
 */
export function ToolLink({ tool }: { tool: Tool }) {
  const launch = useLaunch();
  return (
    <a className="rel" data-cat={tool.category} href={`/t/${tool.slug}`} onClick={(e) => launch(e, tool.slug)} onMouseEnter={() => preloadTool(tool)} onFocus={() => preloadTool(tool)}>
      <span className="card-icon" aria-hidden="true">
        <ToolIcon tool={tool} />
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
