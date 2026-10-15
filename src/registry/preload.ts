import type { Tool } from './types';

/** File tools all share the queue page; it loads on its own, like the interactive tools do. */
export const loadFileTool = () => import('../components/FileTool');

/**
 * Starts downloading a tool page's code before it's opened (card hovered or focused), so the
 * click doesn't wait for the network. Safe to call many times.
 */
export function preloadTool(tool: Tool) {
  (tool.component ? tool.component.preload() : loadFileTool()).catch(() => {});
}
