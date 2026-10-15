import type { ReactNode } from 'react';

/** **bold**, `code` and [links](https://…) inside a line. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={out.length}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={out.length}>{m[2]}</code>);
    else
      out.push(
        <a key={out.length} href={m[4]} target="_blank" rel="noreferrer">
          {m[3]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Just enough Markdown for the changelog: headings (###), paragraphs and "- " lists. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length}>
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('- ')) {
      list.push(t.slice(2));
      continue;
    }
    flush();
    if (!t) continue;
    if (t.startsWith('### ')) blocks.push(<h3 key={blocks.length}>{inline(t.slice(4))}</h3>);
    else blocks.push(<p key={blocks.length}>{inline(t)}</p>);
  }
  flush();
  return <div className="md">{blocks}</div>;
}
