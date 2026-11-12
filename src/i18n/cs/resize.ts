// Resize image.

export const SAME: string[] = [];

export default {
  // ---- tool ----
  'px · % · presets': 'px · % · předvolby',
  'Make pictures smaller or bigger: by percent, to an exact width and height, or with a preset (Full HD, Instagram, YouTube…). Fill and crop to an exact size, pick the quality, and see the new file size before you save. Several pictures at once.':
    'Zmenšete nebo zvětšete obrázky: o procenta, na přesnou šířku a výšku, nebo předvolbou (Full HD, Instagram, YouTube…). Vyplňte a ořízněte na přesný rozměr, zvolte kvalitu a uvidíte novou velikost souboru ještě před uložením. Více obrázků najednou.',

  // ---- presets ----
  'Instagram post': 'Instagram příspěvek',
  'Instagram portrait': 'Instagram na výšku',
  'Story / Reel': 'Story / Reel',
  'YouTube thumbnail': 'Náhled na YouTube',
  'X / Twitter header': 'Záhlaví X / Twitter',
  Icon: 'Ikona',

  // ---- page ----
  'Only pictures can be resized; the other files were left out.': 'Velikost jde měnit jen u obrázků; ostatní soubory byly vynechány.',
  'Keep the picture’s shape: on': 'Zachovat tvar obrázku: zapnuto',
  'Keep the picture’s shape: off': 'Zachovat tvar obrázku: vypnuto',
  'Keep the picture’s shape': 'Zachovat tvar obrázku',
  'When the shape differs': 'Když se tvar liší',
  'Fit inside: the whole picture, as big as fits in the box (one side may be shorter). Fill and crop: exactly this size, the edges that stick out are cut off evenly. Stretch: exactly this size, the picture is squeezed to fit.':
    'Vejít se: celý obrázek, tak velký, jak se vejde do rámečku (jedna strana může být kratší). Vyplnit a oříznout: přesně tento rozměr, okraje, které přečnívají, se rovnoměrně odříznou. Roztáhnout: přesně tento rozměr, obrázek se zdeformuje.',
  'fit inside': 'vejít se',
  'fill and crop': 'vyplnit a oříznout',
  'Leave one side empty, or keep the lock on: the picture keeps its shape. With several pictures, each one fits into the box.':
    'Nechte jednu stranu prázdnou, nebo nechte zámek zapnutý: obrázek si zachová tvar. U více obrázků se každý vejde do rámečku.',
  'Don’t enlarge': 'Nezvětšovat',
  'Pictures smaller than the size you ask for stay as they are. Enlarging can’t add detail, it only makes the picture blurry and the file bigger.':
    'Obrázky menší než požadovaný rozměr zůstanou, jak jsou. Zvětšení nepřidá detaily, obrázek jen rozmaže a soubor zvětší.',
  '80–90 looks the same as the original and makes the file much smaller. Below 60 you start to see blocks.': '80–90 vypadá stejně jako originál a soubor je mnohem menší. Pod 60 začnete vidět kostičky.',
  '{n} % smaller': 'o {n} % menší',
  '{n} % bigger': 'o {n} % větší',
  'The file comes out bigger than the original. Try a lower quality, or save as WebP or JPG (PNG is big for photos).': 'Soubor vyjde větší než originál. Zkuste nižší kvalitu nebo uložte jako WebP či JPG (PNG je na fotky velké).',
  'Made smaller to stay under the biggest size a browser can handle ({max} px a side, about 100 megapixels).': 'Zmenšeno, aby to nepřesáhlo největší rozměr, který prohlížeč zvládne ({max} px na stranu, zhruba 100 megapixelů).',
  'The picture is smaller than that, so it isn’t enlarged (see “Don’t enlarge”).': 'Obrázek je menší, takže se nezvětšuje (viz „Nezvětšovat“).',
  Resize: 'Změnit velikost',
  'Resize all ({n})': 'Změnit velikost všech ({n})',
  'The preview is the real result, shrunk to fit here. Hold “original” to compare.': 'Náhled je skutečný výsledek, zmenšený, aby se sem vešel. Pro porovnání podržte „originál“.',
  'Only the first frame of a GIF is kept.': 'Z GIFu se zachová jen první snímek.',
  'For moving GIFs, use GIF maker.': 'Pro pohyblivé GIFy použijte Tvorbu GIFů.',
} as Record<string, string>;
