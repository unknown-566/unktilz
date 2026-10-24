import { useMemo, useRef, useState } from 'react';
import { SavedPanel, UndoBar } from '../../../components/SavedPanel';
import { useAutosave } from '../../../lib/saved';
import { MiniText, plainText } from '../../../lib/mc/minimessage';
import { Help } from '../../../components/Help';
import { CopyButton, Panel, Segmented } from '../../../components/ui';
import { Workbench } from '../../../components/Workbench';
import { GIVE_VERSIONS, type GiveVersion } from '../../../lib/mc/give';
import { buildText, emptyText, type TextMode, type TextSpec } from '../../../lib/mc/tellraw';
import { MiniToolbar } from '../MiniToolbar';
import { TARGETS } from '../targets';
import { ClickHoverBar } from './ClickHoverBar';
import { t } from '../../../lib/i18n-core';

type Draft = { spec: TextSpec; version: GiveVersion };
type Field = 'text' | 'subtitle';

const MODES: { value: TextMode; label: string }[] = [
  { value: 'chat', label: t('chat (/tellraw)') },
  { value: 'title', label: t('title') },
  { value: 'actionbar', label: t('action bar') },
  { value: 'clear', label: t('clear title') },
];

/** Ready-made starting points. */
const PRESETS: { label: string; make: () => TextSpec }[] = [
  {
    label: t('Welcome + Discord link'),
    make: () => ({
      ...emptyText(),
      text: "<gold><bold>Welcome, <selector:@p>!</bold></gold>\n<gray>Join our <click:open_url:'https://discord.gg/example'><hover:show_text:'<aqua>Opens our Discord'><blue><u>Discord</u></blue></hover></click> for news.", // i18n-ignore: example text
    }),
  },
  {
    label: t('Rules on hover'),
    make: () => ({
      ...emptyText(),
      text: "<yellow>Server rules</yellow> <hover:show_text:'<white>1. Be nice<newline>2. No griefing<newline>3. Have fun'><gray>[point here to read]</gray></hover>", // i18n-ignore: example text
    }),
  },
  {
    label: t('Click to teleport'),
    make: () => ({
      ...emptyText(),
      text: "<green><click:run_command:'/tp @s 0 100 0'><hover:show_text:'Takes you to spawn'>[Click to go to spawn]</hover></click>", // i18n-ignore: example text
    }),
  },
  {
    label: t('Copy the server IP'),
    make: () => ({
      ...emptyText(),
      text: "<gray>Server IP: <click:copy_to_clipboard:play.example.net><hover:show_text:'Click to copy'><aqua>play.example.net</aqua></hover></click>", // i18n-ignore: example text
    }),
  },
  {
    label: t('Countdown title'),
    make: () => ({ ...emptyText(), mode: 'title', text: '<red><bold>3', subtitle: '<gray>Get ready…', fadeIn: '0', stay: '1', fadeOut: '0' }), // i18n-ignore: example text
  },
  { label: t('Coins in the action bar'), make: () => ({ ...emptyText(), mode: 'actionbar', text: '<gold>Coins: <yellow><score:@s:coins>' }) }, // i18n-ignore: example text
];

function NumBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="give-inline-label">
      {label}
      <input className="input mono sm-num" type="number" min={0} step="any" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function TellrawGenerator() {
  const [spec, setSpecRaw] = useState<TextSpec>(emptyText);
  const [version, setVersion] = useState<GiveVersion>('26.1');
  const [targetMode, setTargetMode] = useState('@a');
  const [undo, setUndo] = useState<{ text: string; prev: TextSpec } | null>(null);
  const set = (p: Partial<TextSpec>) => setSpecRaw((s) => ({ ...s, ...p }));
  const setSpec = (next: TextSpec) => {
    setSpecRaw(next);
    setTargetMode(TARGETS.some((tt) => tt.value === next.target) ? next.target : 'name');
  };
  const draft = useMemo<Draft>(() => ({ spec, version }), [spec, version]);
  useAutosave<Draft>('tellraw-generator', draft, (d) => {
    setSpec({ ...emptyText(), ...d.spec });
    setVersion(d.version ?? '26.1');
  });
  const replaceWith = (next: TextSpec, text: string) => {
    if (spec.text.trim() || spec.subtitle.trim()) setUndo({ text, prev: spec });
    setSpec({ ...next, target: spec.target });
  };

  const result = useMemo(() => buildText(spec, version), [spec, version]);
  const chat = spec.mode === 'chat';
  const hasText = spec.mode !== 'clear';

  // ---- the MiniMessage fields: the toolbars edit whichever one was focused last ----
  const fields = useRef(new Map<Field, HTMLInputElement | HTMLTextAreaElement>());
  const [active, setActive] = useState<Field>('text');
  const field: Field = spec.mode === 'title' ? active : 'text';
  const edit = (change: (value: string, start: number, end: number) => { next: string; selStart: number; selEnd: number }) => {
    const el = fields.current.get(field);
    const value = spec[field];
    let start = el?.selectionStart ?? value.length;
    let end = el?.selectionEnd ?? value.length;
    if (start === end) [start, end] = [0, value.length];
    const r = change(value, start, end);
    set({ [field]: r.next });
    setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(r.selStart, r.selEnd);
    }, 0);
  };
  const wrap = (open: string, close: string) =>
    edit((v, s, e) => ({ next: v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e), selStart: s + open.length, selEnd: e + open.length }));
  const insert = (text: string) => {
    const el = fields.current.get(field);
    const value = spec[field];
    const at = el?.selectionEnd ?? value.length;
    set({ [field]: value.slice(0, at) + text + value.slice(at) });
  };
  const reg = (key: Field) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el) fields.current.set(key, el);
    else fields.current.delete(key);
  };

  const preview = (
    <Panel title={t('preview')}>
      {chat ? (
        <div className="tr-chat mc-preview">
          <MiniText text={spec.text || ' '} defaultColor="#FFFFFF" />
        </div>
      ) : (
        <div className="tr-screen mc-preview">
          {spec.mode === 'title' && (
            <div className="tr-title-box">
              <div className="tr-title">
                <MiniText text={spec.text || ' '} defaultColor="#FFFFFF" />
              </div>
              {spec.subtitle.trim() && (
                <div className="tr-subtitle">
                  <MiniText text={spec.subtitle} defaultColor="#FFFFFF" />
                </div>
              )}
            </div>
          )}
          {spec.mode === 'actionbar' && (
            <div className="tr-actionbar">
              <MiniText text={spec.text || ' '} defaultColor="#FFFFFF" />
            </div>
          )}
          {spec.mode === 'clear' && <p className="note">{spec.clearKind === 'clear' ? t('The title on screen goes away.') : t('The title goes away, and the subtitle and times are forgotten.')}</p>}
          <div className="tr-hotbar" aria-hidden="true" />
        </div>
      )}
      {chat && <p className="note">{t('Underlined dots mean the text can be clicked or pointed at: point at it here to see what it does.')}</p>}
    </Panel>
  );

  const all = result.commands.join('\n');
  const output = (
    <Panel
      title={result.commands.length > 1 ? t('commands') : t('command')}
      actions={
        <span className="inline">
          <CopyButton text={all} label={result.commands.length > 1 ? t('copy all') : t('copy')} />
          <CopyButton text={result.commands.map((c) => c.slice(1)).join('\n')} label={t('copy for command block')} />
        </span>
      }
    >
      {result.commands.map((c, i) => (
        <div key={i} className="tr-cmd">
          <pre className="give-cmd mono">{c}</pre>
          <p className={`note mono ${c.length <= 256 ? '' : 'give-warn'}`}>
            {t('{n} / 256 characters', { n: c.length })} · {c.length <= 256 ? t('fits in chat') : t('too long for chat: paste it into a command block instead')}
            {result.commands.length > 1 && (
              <>
                {' · '}
                <CopyButton text={c} label={t('copy')} />
              </>
            )}
          </p>
        </div>
      ))}
      {result.commands.length > 1 && <p className="note">{t('Run them in this order (in command blocks: a chain). The title command shows the title with the subtitle and times set before it.')}</p>}
      {result.notes.map((n) => (
        <p key={n} className="note give-warn">
          {n}
        </p>
      ))}
      <div className="field">
        <label htmlFor="tr-ver">{t('Minecraft version')}</label>
        <select id="tr-ver" className="select" value={version} onChange={(e) => setVersion(e.target.value as GiveVersion)}>
          {GIVE_VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="note">{t('Up to 1.21.4 the text is JSON; from 1.21.5 it\'s SNBT, and clicking and hovering are written differently.')}</span>
      </div>
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => replaceWith({ ...emptyText(), mode: spec.mode }, t('Started over'))}>
        {t('start over')}
      </button>
    </Panel>
  );

  return (
    <Workbench preview={preview} output={output}>
      <section className="panel" aria-label={t('Presets')}>
        <div className="opt-row">
          <h2 className="panel-title">{t('// start from')}</h2>
        </div>
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-sm" onClick={() => replaceWith(p.make(), t('Loaded the “{preset}” preset', { preset: p.label }))}>
              {p.label}
            </button>
          ))}
        </div>
        {undo && <UndoBar text={undo.text} onUndo={() => setSpec(undo.prev)} onClose={() => setUndo(null)} />}
      </section>

      <section className="panel" aria-label={t('Text editor')}>
        <div className="opt-row">
          <span className="opt-label" id="tr-mode">
            {t('Where')}
          </span>
          <Segmented labelledBy="tr-mode" value={spec.mode} onChange={(mode) => set({ mode })} options={MODES} />
        </div>
        <div className="opt-row">
          <span className="opt-label">{t('Who sees it')}</span>
          <span className="inline">
            <select
              className="select"
              aria-label={t('Who sees it')}
              value={targetMode}
              onChange={(e) => {
                setTargetMode(e.target.value);
                if (e.target.value !== 'name') set({ target: e.target.value });
                else set({ target: '' });
              }}
            >
              {TARGETS.map((tt) => (
                <option key={tt.value} value={tt.value}>
                  {tt.label}
                </option>
              ))}
            </select>
            {targetMode === 'name' && <input className="input mono" aria-label={t('Player name')} placeholder={t('Steve')} value={spec.target} onChange={(e) => set({ target: e.target.value })} />}
          </span>
        </div>

        {hasText && (
          <>
            <hr className="divider" />
            <MiniToolbar onWrap={wrap} onInsert={insert} placeholders={[]} hint={spec.mode === 'title' ? t('Click into the title or the subtitle, then pick a color or style.') : t('Select part of the text, then pick a color or style.')} />
            <ClickHoverBar onWrap={wrap} onInsert={insert} chat={chat} />
            <div className="field">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <label htmlFor="tr-text" className="field-label">
                  {chat ? t('Message') : spec.mode === 'title' ? t('Title') : t('Text')}
                </label>
                <Help label={t('Message')} text={t('Colors and styles as MiniMessage tags, e.g. <red>, <bold>, <gradient:gold:red>. The bars above add them for you.')} />
              </span>
              {chat ? (
                <textarea
                  id="tr-text"
                  ref={reg('text')}
                  className="input mono sm-textarea"
                  rows={4}
                  value={spec.text}
                  placeholder={t('e.g. <gold>Welcome!')}
                  onFocus={() => setActive('text')}
                  onChange={(e) => set({ text: e.target.value })}
                  spellCheck={false}
                />
              ) : (
                <input id="tr-text" ref={reg('text')} className="input mono" value={spec.text} placeholder={t('e.g. <gold>Welcome!')} onFocus={() => setActive('text')} onChange={(e) => set({ text: e.target.value })} spellCheck={false} />
              )}
              {chat && <span className="note">{t('Enter starts a new line in chat.')}</span>}
            </div>
            {spec.mode === 'title' && (
              <>
                <div className="field">
                  <label htmlFor="tr-sub" className="field-label">
                    {t('Subtitle')}
                  </label>
                  <input
                    id="tr-sub"
                    ref={reg('subtitle')}
                    className="input mono"
                    value={spec.subtitle}
                    placeholder={t('smaller text under the title (optional)')}
                    onFocus={() => setActive('subtitle')}
                    onChange={(e) => set({ subtitle: e.target.value })}
                    spellCheck={false}
                  />
                </div>
                <div className="field">
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="field-label">{t('How long (seconds)')}</span>
                    <Help label={t('How long (seconds)')} text={t('Fade in, stay and fade out. Empty uses the game\'s 0.5, 3.5 and 1 second. They stay set for that player until changed or reset.')} />
                  </span>
                  <div className="inline">
                    <NumBox label={t('fade in')} value={spec.fadeIn} placeholder="0.5" onChange={(fadeIn) => set({ fadeIn })} />
                    <NumBox label={t('stay')} value={spec.stay} placeholder="3.5" onChange={(stay) => set({ stay })} />
                    <NumBox label={t('fade out')} value={spec.fadeOut} placeholder="1" onChange={(fadeOut) => set({ fadeOut })} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {spec.mode === 'clear' && (
          <div className="opt-row">
            <span className="opt-label" id="tr-clear">
              {t('What')}
            </span>
            <Segmented
              labelledBy="tr-clear"
              value={spec.clearKind}
              onChange={(clearKind) => set({ clearKind })}
              options={[
                { value: 'clear', label: t('take the title away') },
                { value: 'reset', label: t('also reset subtitle and times') },
              ]}
            />
          </div>
        )}
      </section>

      <SavedPanel<TextSpec>
        slug="tellraw-generator"
        title={t('my texts')}
        help={t('Keep messages and titles you made and load them again later. Saved in this browser; Backup (bottom of the page) copies them to another computer.')}
        suggestName={() => plainText(spec.text).trim().slice(0, 30) || MODES.find((m) => m.value === spec.mode)!.label}
        getData={() => spec}
        onLoad={(d) => setSpec({ ...emptyText(), ...d })}
        describe={(i) => MODES.find((m) => m.value === i.data.mode)?.label ?? ''}
        emptyText={t('No saved texts yet. Write one and press save.')}
      />
    </Workbench>
  );
}
