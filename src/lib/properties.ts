// java.util.Properties reading and writing, which is what server.properties uses.

function unescape(s: string) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ t: '\t', n: '\n', r: '\r', f: '\f' } as Record<string, string>)[e] ?? e;
  });
}

export function parseProperties(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i].replace(/^[ \t\f]+/, '');
    if (!line || line[0] === '#' || line[0] === '!') continue;
    // An odd number of trailing backslashes continues the line.
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < raw.length) line = line.slice(0, -1) + raw[++i].replace(/^[ \t\f]+/, '');
    let j = 0;
    let key = '';
    while (j < line.length) {
      const ch = line[j];
      if (ch === '\\') {
        key += line.slice(j, j + 2);
        j += 2;
        continue;
      }
      if (ch === '=' || ch === ':' || ch === ' ' || ch === '\t' || ch === '\f') break;
      key += ch;
      j++;
    }
    while (j < line.length && /[ \t\f]/.test(line[j])) j++;
    if (line[j] === '=' || line[j] === ':') j++;
    while (j < line.length && /[ \t\f]/.test(line[j])) j++;
    out.set(unescape(key), unescape(line.slice(j)));
  }
  return out;
}

function escape(s: string, isKey: boolean) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (ch === ' ' && (isKey || i === 0)) out += '\\ ';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\f') out += '\\f';
    else if ('=:#!'.includes(ch)) out += `\\${ch}`;
    else if (code < 0x20 || code > 0x7e) out += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
    else out += ch;
  }
  return out;
}

export function writeProperties(values: Map<string, string>, header: string) {
  const lines = [`#${header}`, `#${new Date().toString()}`];
  for (const key of [...values.keys()].sort()) lines.push(`${escape(key, true)}=${escape(values.get(key) ?? '', false)}`);
  return `${lines.join('\n')}\n`;
}
