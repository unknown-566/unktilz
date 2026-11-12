/*
 * ShinyText: adapted from React Bits by David Haz (https://reactbits.dev),
 * MIT + Commons Clause license (see THIRD_PARTY_NOTICES.md).
 *
 * Changed for this site: the shine is a CSS animation (.shiny in styles.css) instead of a script, in
 * the text's own color with a lighter band, every few seconds. With reduced motion it's plain text.
 */
import type { ReactNode } from 'react';

export function ShinyText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`shiny${className ? ` ${className}` : ''}`}>{children}</span>;
}
