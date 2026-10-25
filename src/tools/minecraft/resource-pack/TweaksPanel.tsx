import { useMemo } from 'react';
import { Panel } from '../../../components/ui';
import { TWEAKS } from '../../../lib/mc/pack/tweaks';
import type { PackDoc } from '../../../lib/mc/pack/pack';
import type { Vanilla } from '../../../lib/mc/pack/vanilla';
import { pngUrl } from './thumbs';
import { plural, t } from '../../../lib/i18n-core';

/** One-click changes: a card each, with the picture before and after. */
export function TweaksPanel({ doc, vanilla, onChange }: { doc: PackDoc; vanilla: Vanilla; onChange: (tweaks: string[]) => void }) {
  // Before / after pictures, made once per version.
  const shots = useMemo(() => {
    const out = new Map<string, { before: string; after: string } | null>();
    for (const tw of TWEAKS) {
      const before = tw.show && vanilla.files[tw.show];
      if (!tw.show || !before) {
        out.set(tw.id, null);
        continue;
      }
      try {
        const after = tw.apply((p) => vanilla.files[p])[tw.show];
        out.set(tw.id, after ? { before: pngUrl(before), after: pngUrl(after) } : null);
      } catch {
        out.set(tw.id, null);
      }
    }
    return out;
  }, [vanilla]);

  const on = new Set(doc.tweaks);
  const toggle = (id: string) => onChange(on.has(id) ? doc.tweaks.filter((x) => x !== id) : [...doc.tweaks, id]);

  return (
    <Panel title={t('ready-made changes')}>
      <p className="note">{t('Popular small changes, like in Vanilla Tweaks. They take the game’s own files of your version and change them.')}</p>
      <div className="rp-tweaks">
        {TWEAKS.map((tw) => {
          const shot = shots.get(tw.id);
          const mine = tw.paths.filter((p) => doc.textures[p]).length;
          const has = tw.paths.some((p) => vanilla.files[p]);
          return (
            <label key={tw.id} className={`rp-tweak${on.has(tw.id) ? ' on' : ''}${has ? '' : ' off'}`}>
              <input type="checkbox" checked={on.has(tw.id)} onChange={() => toggle(tw.id)} disabled={!has && !on.has(tw.id)} />
              <span className="rp-tweak-text">
                <b>{t(tw.label)}</b>
                <span className="muted">{t(tw.help)}</span>
                {!has && <span className="muted">{t('This version doesn’t have it.')}</span>}
                {on.has(tw.id) && mine > 0 && (
                  <span className="muted">{plural(mine, ['You changed {n} of its textures yourself; yours is used.', 'You changed {n} of its textures yourself; yours are used.'], ['{n} z jejích textur jste změnili sami; použije se ta vaše.', '{n} z jejích textur jste změnili sami; použijí se ty vaše.', '{n} z jejích textur jste změnili sami; použijí se ty vaše.'])}</span>
                )}
              </span>
              {shot && (
                <span className="rp-tweak-shots" aria-hidden="true">
                  <img src={shot.before} alt="" />
                  <span>→</span>
                  <img src={shot.after} alt="" />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </Panel>
  );
}
