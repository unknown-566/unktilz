// Checks the Czech translation (npm run i18n:check):
//  - every text given to t() / tc() / tx() has a Czech entry (src/i18n/cs/),
//  - no text people read is left outside t(): JSX text, UI attributes (title, placeholder,
//    aria-label…), strings shown in JSX, labels in objects, error messages, dialogs,
//  - each entry keeps the same {placeholders}.
// `// i18n-ignore` on a line (or the line above) skips it; `// i18n-ignore-file` skips a file.
//   --list      print every finding
//   --unused    print dictionary entries nothing uses
//   --suspects  print other strings that read like words (texts passed to functions…)
//   --fix FILE… wrap the plain cases in those files in t() (and add the import); what needs a
//               person (sentences around elements, templates with conditions, +) is listed
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { OBJ_PROPS, PROP_DEFAULTS, SHOW_CALLS, TOOL_PROPS, UI_ATTRS, wordy } from './i18n-rules.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');
const dictDir = join(src, 'i18n', 'cs');
const argv = process.argv.slice(2);
const args = new Set(argv);

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mts)$/.test(n) && !n.endsWith('.d.ts') ? [p] : [];
  });

const parse = (file, code = readFileSync(file, 'utf8')) => ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const textOf = (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const T_CALLS = ['t', 'tx', 'tc', 'tn', 'plural'];

/** Every place in a file where a text is used as a key, or shown without t(). */
function scan(file, code) {
  const sf = parse(file, code);
  const lines = code.split('\n');
  const isTool = file.endsWith('.tool.ts');
  const keys = [];
  const raw = []; // { node, s, why, fix?: [start, end, text] | null, note? }
  const suspects = [];
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
  const ignored = (n) => /i18n-ignore/.test(lines[lineOf(n)] ?? '') || /i18n-ignore/.test(lines[lineOf(n) - 1] ?? '');
  const feeds = (n) => {
    let p = n.parent;
    while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || (ts.isBinaryExpression(p) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken].includes(p.operatorToken.kind))))
      p = p.parent;
    return p;
  };
  const callName = (p) => (p && ts.isCallExpression(p) ? p.expression.getText(sf) : '');
  const report = (n, s, why, fix, note) => {
    if (!ignored(n) && wordy(s)) raw.push({ line: lineOf(n) + 1, s, why, fix, note });
  };
  /** A string (or template) wrapped in t(); templates become t('… {a} …', { a }). */
  const wrap = (n) => {
    if (!ts.isTemplateExpression(n)) return [[n.getStart(sf), n.getEnd(), `t(${q(n.text)})`]];
    let s = n.head.text;
    const vars = [];
    for (const span of n.templateSpans) {
      const e = span.expression;
      const math = ts.isBinaryExpression(e) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(e.operatorToken.kind);
      // "a ?? b" and "a || b" are one value: named after a.
      const either = ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind);
      if (ts.isConditionalExpression(e) || (ts.isBinaryExpression(e) && !math && !either)) return null;
      const named = either ? e.left : e;
      let name = ts.isIdentifier(named) ? named.text : ts.isPropertyAccessExpression(named) ? named.name.text : ts.isCallExpression(named) && ts.isIdentifier(named.expression) ? named.expression.text : math ? 'n' : `v${vars.length + 1}`;
      const known = vars.find((v) => v.name === name);
      if (known && known.expr !== e.getText(sf)) name = `${name}${vars.length + 1}`;
      if (!vars.some((v) => v.name === name)) vars.push({ name, expr: e.getText(sf) });
      s += `{${name}}${span.literal.text}`;
    }
    return [[n.getStart(sf), n.getEnd(), `t(${q(s)}, { ${vars.map((v) => (v.name === v.expr ? v.name : `${v.name}: ${v.expr}`)).join(', ')} })`]];
  };
  const visit = (n) => {
    const name = callName(n);
    if (ts.isCallExpression(n) && name === 'tc' && n.arguments[1]) {
      const ctx = textOf(n.arguments[0]);
      const k = textOf(n.arguments[1]);
      if (ctx !== null && k !== null) keys.push({ k: `${ctx}|${k}`, line: lineOf(n) + 1 });
    }
    if (ts.isCallExpression(n) && (name === 't' || name === 'tx' || name === 'tn') && n.arguments[0]) {
      const k = textOf(n.arguments[0]);
      if (k !== null) keys.push({ k, line: lineOf(n) + 1 });
      else if (ts.isTemplateExpression(n.arguments[0])) report(n, n.arguments[0].getText(sf), 't() with a template: use {vars}', null);
    }
    if (ts.isJsxText(n)) {
      const s = n.text.replace(/\s+/g, ' ').trim();
      if (s) {
        const full = n.getFullText(sf);
        const lead = full.match(/^\s*/)[0];
        const trail = full.match(/\s*$/)[0];
        const siblings = n.parent.children ?? [];
        const mixed = siblings.some((c) => !ts.isJsxText(c)) && siblings.some((c) => c !== n && ts.isJsxText(c) && c.text.trim());
        const mixed2 = siblings.some((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxExpression(c));
        report(n, s, 'JSX text', [[n.getFullStart(), n.getEnd(), `${lead}{t(${q(s)})}${trail}`]], mixed || mixed2 ? 'a sentence around other elements: check it reads as one' : null);
      }
    }
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && UI_ATTRS.has(n.name.getText(sf)))
      report(n, n.initializer.text, `${n.name.getText(sf)}=`, [[n.initializer.getStart(sf), n.initializer.getEnd(), `{t(${q(n.initializer.text)})}`]]);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const s = ts.isTemplateExpression(n) ? n.head.text + n.templateSpans.map((x) => `{x}${x.literal.text}`).join('') : n.text;
      const p = feeds(n);
      const plus = ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken;
      if (!T_CALLS.includes(callName(p)) && !ts.isJsxAttribute(n.parent)) {
        let why = null;
        if (p && ts.isJsxExpression(p) && !(ts.isJsxAttribute(p.parent) && !UI_ATTRS.has(p.parent.name.getText(sf)))) why = 'shown in JSX';
        else if (p && ts.isNewExpression(p) && p.expression.getText(sf) === 'Error') why = 'error message';
        else if (p && ts.isCallExpression(p) && SHOW_CALLS.test(callName(p))) why = `${callName(p)}()`;
        else if (p && ts.isPropertyAssignment(p) && (isTool ? TOOL_PROPS : OBJ_PROPS).has(p.name.getText(sf))) why = `${p.name.getText(sf)}:`;
        else if (p && ts.isBindingElement(p) && PROP_DEFAULTS.has(p.name.getText(sf))) why = `${p.name.getText(sf)} = (default)`;
        else if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.left.getText(sf) === 'document.title') why = 'document.title';
        if (why && wordy(s)) {
          const fix = wrap(n);
          report(n, s, why, fix, !fix ? 'a template with a condition' : plus ? 'joined with +: check it reads as one' : null);
          return;
        }
        // Not clearly shown, but it reads like words: worth a look (--suspects).
        const quiet =
          !p ||
          ts.isImportDeclaration(p) ||
          ts.isExportDeclaration(p) ||
          ts.isImportTypeNode?.(p) ||
          ts.isLiteralTypeNode(p) ||
          ts.isCaseClause(p) ||
          ts.isElementAccessExpression(p) ||
          (ts.isPropertyAssignment(p) && p.name === n) ||
          (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) ||
          (ts.isCallExpression(p) && /^(console\.\w+|import|require|new RegExp|.*\.(startsWith|endsWith|includes|split|join|replace|test|match|querySelector|querySelectorAll|getItem|setItem|removeItem|addEventListener|removeEventListener|get|set|has|getContext|toBlob|convertToBlob|createElement|setAttribute|getAttribute|toDataURL|padStart|padEnd))$/.test(callName(p))) ||
          (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) ||
          // plural()'s forms, and search keywords
          (ts.isArrayLiteralExpression(p) && ((ts.isCallExpression(p.parent) && callName(p.parent) === 'plural') || (ts.isPropertyAssignment(p.parent) && p.parent.name.getText(sf) === 'keywords')));
        if (!quiet && !ignored(n) && wordy(s) && (/[A-Za-z]{2,} [A-Za-z]{2,}/.test(s) || /^[A-Z][a-z]{2,}[.!?]?$/.test(s)) && !/^[\w.-]+\/[\w./-]+$/.test(s))
          suspects.push({ line: lineOf(n) + 1, s });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { keys, raw, suspects };
}

// ---- --fix ----
if (args.has('--fix')) {
  const targets = argv.filter((a) => !a.startsWith('--')).map((f) => resolve(root, f));
  for (const file of targets) {
    const code = readFileSync(file, 'utf8');
    const { raw } = scan(file, code);
    const edits = raw.filter((r) => r.fix).flatMap((r) => r.fix);
    for (const r of raw) if (r.note || !r.fix) console.log(`  ${relative(root, file)}:${r.line}  ${r.note ?? 'needs a person'}: ${JSON.stringify(r.s.slice(0, 100))}`);
    if (!edits.length) continue;
    // Inner first, so a wrapped text inside another isn't cut.
    edits.sort((a, b) => b[0] - a[0]);
    let out = code;
    let last = Infinity;
    for (const [a, b, r] of edits) {
      if (b > last) continue;
      out = out.slice(0, a) + r + out.slice(b);
      last = a;
    }
    if (!/import \{[^}]*\bt\b[^}]*\} from '[^']*\/i18n(-core)?';/.test(out)) {
      let rel = relative(dirname(file), join(src, 'lib', 'i18n-core')).replace(/\\/g, '/');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      const imports = [...out.matchAll(/^import [^;]*?;[ \t]*$/gm)];
      const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : -1;
      out = at >= 0 ? `${out.slice(0, at)}\nimport { t } from '${rel}';${out.slice(at)}` : `import { t } from '${rel}';\n\n${out}`;
    }
    writeFileSync(file, out);
    console.log(`${relative(root, file)}: ${edits.length} wrapped`);
  }
  process.exit(0);
}

// ---- the dictionary ----
const dict = new Map();
const same = new Set();
for (const file of walk(dictDir)) {
  const sf = parse(file);
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && ts.isObjectLiteralExpression(n.parent)) {
      const key = ts.isStringLiteral(n.name) || ts.isNoSubstitutionTemplateLiteral(n.name) ? n.name.text : ts.isIdentifier(n.name) ? n.name.text : null;
      const val = textOf(n.initializer);
      if (key !== null && val !== null) {
        if (dict.has(key)) console.log(`duplicate entry in ${relative(root, file)}: ${JSON.stringify(key)}`);
        dict.set(key, val);
      }
    }
    // SAME: texts that read the same in Czech.
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'SAME' && n.initializer && ts.isArrayLiteralExpression(n.initializer))
      for (const el of n.initializer.elements) if (textOf(el) !== null) same.add(textOf(el));
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ---- the code ----
const used = new Map(); // key → first place
const flagged = [];
const suspectList = [];
for (const file of walk(src).filter((f) => !f.startsWith(dictDir))) {
  const code = readFileSync(file, 'utf8');
  if (code.includes('i18n-ignore-file')) continue;
  const rel = relative(root, file).replace(/\\/g, '/');
  const { keys, raw, suspects } = scan(file, code);
  if (args.has('--suspects')) for (const x of suspects) suspectList.push({ at: `${rel}:${x.line}`, s: x.s });
  for (const { k, line } of keys) if (!used.has(k)) used.set(k, `${rel}:${line}`);
  for (const r of raw) flagged.push({ at: `${rel}:${r.line}`, s: r.s, why: r.why });
}

// ---- report ----
const missing = [...used].filter(([k]) => !dict.has(k) && !same.has(k));
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const badVars = [...dict].filter(([en, cs]) => vars(en.replace(/^[\w-]+\|/, '')) !== vars(cs));
// every tool needs Czech search words (src/i18n/cs/keywords.ts)
const slugs = walk(src).filter((f) => f.endsWith('.tool.ts')).map((f) => readFileSync(f, 'utf8').match(/slug: '([^']+)'/)?.[1]).filter(Boolean);
const noKeywords = slugs.filter((s) => !dict.has('keywords:' + s));
const unused = [...dict.keys()].filter((k) => !used.has(k) && !k.startsWith('keywords:'));
const byFile = (list) => {
  const m = new Map();
  for (const f of list) {
    const file = f.at.replace(/:\d+$/, '');
    m.set(file, (m.get(file) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};

console.log(`dictionary: ${dict.size} entries (+${same.size} the same in Czech) · texts in t(): ${used.size}`);
console.log(`missing Czech: ${missing.length} · not in t(): ${flagged.length} · {vars} that don't match: ${badVars.length} · unused: ${unused.length} · tools without Czech search words: ${noKeywords.length}`);
for (const s of noKeywords) console.log(`  no search words  "keywords:${s}" (src/i18n/cs/keywords.ts)`);
const only = argv.find((a) => !a.startsWith('--'));
const mine = (at) => !only || at.includes(only.replace(/\\/g, '/'));
if (args.has('--list')) {
  for (const [k, at] of missing) if (mine(at)) console.log(`  missing  ${at}  ${JSON.stringify(k)}`);
  for (const f of flagged) if (mine(f.at)) console.log(`  raw      ${f.at}  (${f.why})  ${JSON.stringify(f.s)}`);
} else {
  if (missing.length) console.log('missing by file:\n' + byFile(missing.map(([, at]) => ({ at }))).map(([f, n]) => `  ${n}\t${f}`).join('\n'));
  if (flagged.length) console.log('not in t() by file:\n' + byFile(flagged).map(([f, n]) => `  ${n}\t${f}`).join('\n'));
}
for (const [en, cs] of badVars) console.log(`  vars     ${JSON.stringify(en)} → ${JSON.stringify(cs)}`);
if (args.has('--unused')) for (const k of unused) console.log(`  unused   ${JSON.stringify(k)}`);
if (args.has('--suspects')) for (const x of suspectList) if (mine(x.at)) console.log(`  suspect  ${x.at}  ${JSON.stringify(x.s)}`);
process.exitCode = missing.length || flagged.length || badVars.length || noKeywords.length ? 1 : 0;
