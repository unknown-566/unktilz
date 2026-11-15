// Developer tools added in 1.25 (bitwise, …).

export const SAME = ['& | ^ ~ << >>'];

export default {
  // ---- bitwise ----
  'Bitwise & bit shift': 'Bitové operace a posuny',
  'AND, OR, XOR, NOT and bit shifts on 8, 16, 32 or 64-bit numbers, signed or not. See every bit, click one to flip it, and get the result in decimal, hex, binary and octal.':
    'AND, OR, XOR, NOT a bitové posuny na 8, 16, 32 nebo 64bitových číslech, se znaménkem i bez. Uvidíte každý bit, kliknutím ho přepnete a výsledek dostanete v desítkové, šestnáctkové, dvojkové i osmičkové soustavě.',
  'Expression': 'Výraz',
  'Operators': 'Operátory',
  'Try:': 'Zkuste:',
  'Calculation': 'Výpočet',
  'Numbers in decimal, 0x hex, 0b binary or 0o octal, with one operator between them.': 'Čísla desítkově, 0x šestnáctkově, 0b dvojkově nebo 0o osmičkově, mezi nimi jeden operátor.',
  'Type an expression above, like 0xFF & 0x0F or 5 << 2.': 'Napište výraz nahoru, třeba 0xFF & 0x0F nebo 5 << 2.',
  'A number is expected here. Use digits, or 0x… for hex, 0b… for binary, 0o… for octal.': 'Tady má být číslo. Použijte číslice, nebo 0x… pro šestnáctkovou, 0b… pro dvojkovou a 0o… pro osmičkovou soustavu.',
  'An operator is expected here: & | ^ << >> >>> rol ror (or and, or, xor…).': 'Tady má být operátor: & | ^ << >> >>> rol ror (nebo and, or, xor…).',
  'A second number is missing after the operator.': 'Za operátorem chybí druhé číslo.',
  'There’s something extra at the end. One operator at a time.': 'Na konci je něco navíc. Vždy jen jeden operátor.',
  'A number doesn’t fit in {w} bits, so only its lowest {w} bits are used.': 'Číslo se nevejde do {w} bitů, proto se použije jen jeho nejnižších {w} bitů.',
  'Click a bit of a number to flip it (the box changes too). Click a value to copy it.': 'Kliknutím na bit čísla ho přepnete (změní se i výraz). Kliknutím na hodnotu ji zkopírujete.',
  '1 only where both have a 1. Used to keep some bits and clear the rest (a mask).': '1 jen tam, kde mají 1 obě čísla. Slouží k ponechání některých bitů a vynulování ostatních (maska).',
  '1 where either has a 1. Used to turn bits on.': '1 tam, kde má 1 aspoň jedno číslo. Slouží k zapnutí bitů.',
  '1 where they differ. Used to flip bits; doing it twice gives the number back.': '1 tam, kde se liší. Slouží k přepnutí bitů; když to uděláte dvakrát, dostanete zpět původní číslo.',
  'Flips every bit of one number.': 'Přepne všechny bity jednoho čísla.',
  'shift left': 'posun doleva',
  'Moves every bit left; zeros come in on the right. Each step doubles the number, until bits fall off the left.': 'Posune všechny bity doleva; zprava přijdou nuly. Každý krok číslo zdvojnásobí, dokud bity nezačnou vypadávat vlevo.',
  'shift right': 'posun doprava',
  'Moves every bit right and copies the sign bit in on the left, so negative numbers stay negative. Each step halves the number, rounding down.': 'Posune všechny bity doprava a zleva doplní kopii znaménkového bitu, takže záporná čísla zůstanou záporná. Každý krok číslo vydělí dvěma a zaokrouhlí dolů.',
  'zero-fill right': 'doprava s nulami',
  'Moves every bit right; zeros come in on the left. For positive numbers the same as >>.': 'Posune všechny bity doprava; zleva přijdou nuly. U kladných čísel stejné jako >>.',
  'rotate left': 'rotace doleva',
  'Like a left shift, but the bits that fall off the left come back in on the right. Nothing is lost.': 'Jako posun doleva, ale bity, které vypadnou vlevo, se vrátí zprava. Nic se neztratí.',
  'rotate right': 'rotace doprava',
  'Like a right shift, but the bits that fall off the right come back in on the left. Nothing is lost.': 'Jako posun doprava, ale bity, které vypadnou vpravo, se vrátí zleva. Nic se neztratí.',
  '{n} bit': '{n} bit',
  Signed: 'Se znaménkem',
  'Reads the highest bit as the sign (two’s complement), like int in most languages: 8 bits then go from −128 to 127 instead of 0 to 255. The bits stay the same, only how they’re read changes.':
    'Nejvyšší bit se čte jako znaménko (dvojkový doplněk), jako int ve většině jazyků: 8 bitů pak jde od −128 do 127 místo od 0 do 255. Bity zůstávají stejné, mění se jen to, jak se čtou.',
  Bits: 'Bity',
  'Bit {i}': 'Bit {i}',
  'Click to copy': 'Kliknutím zkopírujete',
  decimal: 'desítkově',
  'decimal (signed)': 'desítkově (se znaménkem)',
  unsigned: 'bez znaménka',
  'as signed': 'se znaménkem',
  'base|binary': 'dvojkově',
  'base|octal': 'osmičkově',
} as Record<string, string>;
