import { useQueue } from '../queue/store';
import { plural, setLang, type Lang } from './i18n';

/**
 * Switching the language reloads the page. Downloads carry on after it, but work made from what a
 * page holds in memory (GIF maker, crop…) would stop, so that asks first.
 */
export function switchLang(to: Lang) {
  const lost = useQueue.getState().jobs.filter((j) => j.task && !j.resume && (j.status === 'running' || j.status === 'queued')).length;
  if (
    lost &&
    !window.confirm(
      plural(
        lost,
        ['Changing the language reloads the page and stops {n} job that is being made. Change it anyway?', 'Changing the language reloads the page and stops {n} jobs that are being made. Change it anyway?'],
        ['Změna jazyka obnoví stránku a zastaví {n} rozdělanou úlohu. Přesto změnit?', 'Změna jazyka obnoví stránku a zastaví {n} rozdělané úlohy. Přesto změnit?', 'Změna jazyka obnoví stránku a zastaví {n} rozdělaných úloh. Přesto změnit?'],
      ),
    )
  )
    return;
  setLang(to);
}
