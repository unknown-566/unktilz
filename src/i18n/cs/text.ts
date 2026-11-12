// Text tools (word counter).

export const SAME: string[] = [];

export default {
  // ---- tool ----
  'Word counter': 'Počítadlo slov',
  'words · characters · time': 'slova · znaky · čas',
  'Count words, characters, sentences and paragraphs as you type, see how long it takes to read, and which words you use most.': 'Spočítejte slova, znaky, věty a odstavce už při psaní, zjistěte, jak dlouho trvá text přečíst, a která slova používáte nejčastěji.',

  // ---- word counter ----
  counts: 'počty',
  words: 'slova',
  characters: 'znaky',
  'without spaces': 'bez mezer',
  sentences: 'věty',
  paragraphs: 'odstavce',
  lines: 'řádky',
  'reading time': 'čtení',
  'speaking time': 'předčítání nahlas',
  '{s} s': '{s} s',
  '{m} min {s} s': '{m} min {s} s',
  '{m} min': '{m} min',
  '{h} h {m} min': '{h} h {m} min',
  'Reading at {read} words a minute, speaking at {speak}. {n} different words.': 'Počítá se se čtením {read} slov za minutu a předčítáním {speak}. Různých slov: {n}.',
  'most used words': 'nejčastější slova',
  'Short words': 'Krátká slova',
  'short words': 'krátká slova',
  'Also count words of one or two letters, like “a”, “of” or “to”. They are usually the most common, so they are left out by default. Numbers are never listed.': 'Započítat i slova s jedním nebo dvěma písmeny, jako „a“, „v“ nebo „na“. Bývají nejčastější, proto jsou ve výchozím stavu vynechaná. Čísla se nevypisují nikdy.',
  'Type or paste some text to see its most used words.': 'Napište nebo vložte text a uvidíte jeho nejčastější slova.',
  'Type or paste text here…': 'Sem napište nebo vložte text…',
} as Record<string, string>;
