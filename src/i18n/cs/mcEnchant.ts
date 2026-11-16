// The enchantment order calculator (1.28).

export const SAME: string[] = [];

export default {
  'Enchantment order calculator': 'Výpočet pořadí enchantů',
  'cheapest anvil order': 'nejlevnější pořadí v kovadlině',
  'Pick an item and the enchantment books you want on it, and see the order to combine them in the anvil that costs the fewest levels and never hits "Too Expensive!".':
    'Vyberte předmět a knihy s enchanty, které na něj chcete, a uvidíte pořadí spojování v kovadlině, které stojí nejméně levelů a nikdy nenarazí na „Too Expensive!“.',
  Helmet: 'Helma',
  Chestplate: 'Hrudní plát',
  Leggings: 'Kalhoty',
  Boots: 'Boty',
  Sword: 'Meč',
  Spear: 'Kopí',
  Axe: 'Sekera',
  Pickaxe: 'Krumpáč',
  Shovel: 'Lopata',
  Hoe: 'Motyka',
  Mace: 'Palcát',
  Bow: 'Luk',
  Crossbow: 'Kuše',
  Trident: 'Trojzubec',
  'Fishing rod': 'Rybářský prut',
  Shears: 'Nůžky',
  Elytra: 'Krovky',
  Shield: 'Štít',
  'Flint and steel': 'Křesadlo',
  'Carrot on a stick': 'Mrkev na prutu',
  Brush: 'Štětec',
  item: 'předmět',
  'Times it was already in an anvil': 'Kolikrát už byl v kovadlině',
  'Every trip through the anvil makes the next one dearer (1, 3, 7, 15… levels more). A new item from the crafting table or the enchanting table: 0. Renaming counts too.':
    'Každý průchod kovadlinou zdraží ten další (o 1, 3, 7, 15… levelů). Nový předmět z pracovního stolu nebo očarovacího stolu: 0. Počítá se i přejmenování.',
  'not with {name}': 'nejde s {name}',
  'Level of {name}': 'Úroveň {name}',
  'Each enchantment is one book. Enchantment names are in English, like in the game’s commands. Java Edition rules.':
    'Každý enchant je jedna kniha. Názvy enchantů jsou anglicky, jako v příkazech hry. Platí pravidla Java Edition.',
  'cheapest order': 'nejlevnější pořadí',
  'Pick the enchantments you want above.': 'Nahoře vyberte enchanty, které chcete.',
  'No order works: some step would cost more than 39 levels ("Too Expensive!"). Leave out an enchantment, or start with an item that has been in the anvil fewer times.':
    'Žádné pořadí nejde: některý krok by stál víc než 39 levelů („Too Expensive!“). Vynechte jeden enchant, nebo začněte s předmětem, který byl v kovadlině méněkrát.',
  'levels in total': 'levelů celkem',
  'most expensive step': 'nejdražší krok',
  'XP points, at least': 'XP bodů, nejméně',
  'putting them on one by one': 'přidávat je po jednom',
  '{n} levels more': 'o {n} levelů víc',
  'the same': 'stejně',
  'too expensive': 'moc drahé',
  plus: 'plus',
  'from step {n}': 'z kroku {n}',
  'Put the first thing in the left slot of the anvil and the second in the right one. Books joined in an earlier step are used whole later.':
    'První věc dejte do levého políčka kovadliny a druhou do pravého. Knihy spojené v dřívějším kroku se později použijí celé.',
  'A step costs the levels of the enchantments in the right slot (times a number for each enchantment, from 1 for Sharpness to 4 for Silk Touch or Thorns, on a book) plus 1, 3, 7, 15… for every earlier anvil trip of both things. Above {max} levels the game says "Too Expensive!".':
    'Krok stojí levely enchantů v pravém políčku (krát číslo podle enchantu, na knize od 1 u Sharpness po 4 u Silk Touch nebo Thorns) plus 1, 3, 7, 15… za každý dřívější průchod kovadlinou u obou věcí. Nad {max} levelů hra napíše „Too Expensive!“.',
} as Record<string, string>;
