import { useState } from 'react';
import { Help } from '../../../components/Help';
import { Segmented } from '../../../components/ui';
import { t } from '../../../lib/i18n-core';

type Tool = 'click' | 'hover' | 'insert' | 'player' | 'score' | 'lang';

const CLICKS = [
  { value: 'open_url', label: t('open a link'), placeholder: 'https://discord.gg/…' },
  { value: 'run_command', label: t('run a command'), placeholder: '/tp @s 0 64 0' },
  { value: 'suggest_command', label: t('write in chat'), placeholder: '/msg Steve ' },
  { value: 'copy_to_clipboard', label: t('copy'), placeholder: 'play.example.net' },
  { value: 'change_page', label: t('go to book page'), placeholder: '2' },
];

/** A MiniMessage argument: quoted when it has characters that would end or split the tag. */
const arg = (s: string) => (/[<>:'"\s]/.test(s) ? (s.includes("'") ? `"${s.replace(/"/g, '')}"` : `'${s}'`) : s);

/**
 * Clicking, hovering and what the game fills in, for chat text. Select part of the text, pick what
 * it does, press the button: the selection gets wrapped in the tag (like the color toolbar).
 */
export function ClickHoverBar({
  onWrap,
  onInsert,
  chat,
  sign,
}: {
  onWrap: (open: string, close: string) => void;
  onInsert: (text: string) => void;
  chat: boolean;
  /** Sign text: clicking can only run a command, and there's no hover or shift-click. */
  sign?: boolean;
}) {
  const [tool, setTool] = useState<Tool>('click');
  const [action, setAction] = useState(sign ? 'run_command' : 'open_url');
  const clicks = sign ? CLICKS.filter((c) => c.value === 'run_command') : CLICKS;
  const [value, setValue] = useState('');
  const [hover, setHover] = useState('');
  const [insert, setInsert] = useState('');
  const [selector, setSelector] = useState('@p');
  const [scoreName, setScoreName] = useState('@s');
  const [objective, setObjective] = useState('');
  const [lang, setLang] = useState('');
  const click = clicks.find((c) => c.value === action) ?? clicks[0];

  const tools: { value: Tool; label: string }[] = [
    ...(sign ? [{ value: 'click' as Tool, label: t('on click') }] : []),
    ...(chat && !sign
      ? [
          { value: 'click' as Tool, label: t('on click') },
          { value: 'hover' as Tool, label: t('on hover') },
          { value: 'insert' as Tool, label: t('shift-click') },
        ]
      : []),
    { value: 'player', label: t('player name') },
    { value: 'score', label: t('score') },
    { value: 'lang', label: t('translated text') },
  ];
  const current = tools.some((x) => x.value === tool) ? tool : tools[0].value;

  return (
    <div className="tr-bar">
      <div className="opt-row">
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span className="opt-label">{chat || sign ? t('Clicks & more') : t('Insert')}</span>
          <Help
            label={t('Clicks & more')}
            text={
              sign
                ? t('Select a line\'s text and press the button: clicking the sign runs the command (as an operator). Player name, score and translated text are filled in by the game.')
                : chat
                ? t('Select part of the text, pick what it does and press the button. On click: open a link, run a command, write into the chat box or copy. On hover: a bubble with text when pointing at it. Player name, score and translated text are filled in by the game for each player.')
                : t('Player name, score and translated text are filled in by the game for each player.')
            }
          />
        </span>
        <Segmented compact value={current} onChange={setTool} options={tools} label={t('What to add')} />
      </div>
      {current === 'click' && (
        <div className="inline tr-row">
          <select className="select" aria-label={t('What clicking does')} value={action} onChange={(e) => setAction(e.target.value)}>
            {clicks.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input className="input mono" aria-label={t('Link, command or text')} value={value} placeholder={click.placeholder} spellCheck={false} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!value.trim()} onClick={() => onWrap(`<click:${click.value}:${arg(value.trim())}>`, '</click>')}>
            {t('apply to selection')}
          </button>
        </div>
      )}
      {current === 'hover' && (
        <div className="inline tr-row">
          <input className="input mono" aria-label={t('Text in the bubble')} value={hover} placeholder={t('e.g. <gray>Click to join')} spellCheck={false} onChange={(e) => setHover(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!hover.trim()} onClick={() => onWrap(`<hover:show_text:${arg(hover.trim())}>`, '</hover>')}>
            {t('apply to selection')}
          </button>
        </div>
      )}
      {current === 'insert' && (
        <div className="inline tr-row">
          <input className="input mono" aria-label={t('Text shift-click puts into the chat box')} value={insert} placeholder={t('text for the chat box')} spellCheck={false} onChange={(e) => setInsert(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!insert.trim()} onClick={() => onWrap(`<insert:${arg(insert.trim())}>`, '</insert>')}>
            {t('apply to selection')}
          </button>
        </div>
      )}
      {current === 'player' && (
        <div className="inline tr-row">
          <input className="input mono" aria-label={t('Who')} value={selector} placeholder="@p" spellCheck={false} onChange={(e) => setSelector(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!selector.trim()} onClick={() => onInsert(`<selector:${arg(selector.trim())}>`)}>
            {t('insert')}
          </button>
          <span className="note">{t('@p nearest player, @s who runs it, @a everyone, @e[type=zombie] entities…')}</span>
        </div>
      )}
      {current === 'score' && (
        <div className="inline tr-row">
          <input className="input mono" aria-label={t('Whose score')} value={scoreName} placeholder="@s" spellCheck={false} onChange={(e) => setScoreName(e.target.value)} />
          <input className="input mono" aria-label={t('Objective')} value={objective} placeholder={t('objective, e.g. kills')} spellCheck={false} onChange={(e) => setObjective(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!objective.trim()} onClick={() => onInsert(`<score:${arg(scoreName.trim() || '@s')}:${arg(objective.trim())}>`)}>
            {t('insert')}
          </button>
        </div>
      )}
      {current === 'lang' && (
        <div className="inline tr-row">
          <input className="input mono" aria-label={t('Translation key')} value={lang} placeholder="item.minecraft.diamond" spellCheck={false} onChange={(e) => setLang(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!lang.trim()} onClick={() => onInsert(`<lang:${arg(lang.trim())}>`)}>
            {t('insert')}
          </button>
          <span className="note">{t('A key from the game’s language files; every player sees it in their own language (item.minecraft.diamond → Diamant).')}</span>
        </div>
      )}
    </div>
  );
}
