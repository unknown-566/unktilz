// Tool names, descriptions and the options of the file tools (*.tool.ts and their option lists).

/** Texts that read the same in Czech. */
export const SAME = [
  'mp3 · wav · ogg · flac',
  'mp4 · webm · mov · gif',
  'png · jpg · webp · ico',
  'px · %',
  'earrape · bass boosted',
  '144p · deep fried',
  'ASL · profile.yml',
  'xyz → r.x.z',
  '§a · <green>',
  'item → /give',
  'xyz ÷ 8',
  'skin → /give',
  '.properties',
  'java · bedrock',
  '3D · .png',
  'seed',
  '.pdf → .png / .jpg',
  'yt-dlp · aria2c',
  '44.1 kHz',
  '48 kHz',
  'favicon (16–48)',
  'map art',
];

export default {
  // ---- audio ----
  'Audio converter': 'Převod zvuku',
  'Convert sound to MP3, WAV, OGG, Opus, FLAC or M4A, or take the sound out of a video. Can also cut it shorter, fade it in and out and fix the volume.':
    'Převeďte zvuk do MP3, WAV, OGG, Opus, FLAC nebo M4A, nebo vytáhněte zvuk z videa. Umí ho také zkrátit, plynule zesílit a zeslabit a upravit hlasitost.',
  Format: 'Formát',
  'MP3 plays everywhere. OGG is what Minecraft sounds use. Opus is the smallest for the same quality. M4A is for Apple devices. WAV and FLAC keep the sound exactly (FLAC is about half the size of WAV).':
    'MP3 hraje všude. OGG používají zvuky v Minecraftu. Opus je při stejné kvalitě nejmenší. M4A je pro zařízení Apple. WAV a FLAC zachovají zvuk přesně (FLAC má zhruba poloviční velikost oproti WAV).',
  Volume: 'Hlasitost',
  'Normalize makes quiet and loud files sound about equally loud (like streaming apps do). Louder and quieter change it by about double / half.':
    'Vyrovnat srovná tiché a hlasité soubory na zhruba stejnou hlasitost (jako to dělají streamovací aplikace). Hlasitěji a tišeji ji zhruba zdvojnásobí / sníží na polovinu.',
  keep: 'ponechat',
  normalize: 'vyrovnat',
  louder: 'hlasitěji',
  quieter: 'tišeji',
  'Start at': 'Začátek',
  'Cut off the beginning. Seconds (90) or minutes:seconds (1:30). Empty starts at the beginning.': 'Ořízne začátek. Sekundy (90) nebo minuty:sekundy (1:30). Prázdné = od začátku.',
  'e.g. 0:05': 'např. 0:05',
  'End at': 'Konec',
  'Cut off the end: the time in the original where it should stop. Empty goes to the end.': 'Ořízne konec: čas v originálu, kde má skončit. Prázdné = až do konce.',
  'e.g. 1:30': 'např. 1:30',
  'Fade in': 'Postupné zesílení',
  'Seconds to go from silence to full volume at the start. 0 = no fade.': 'Kolik sekund trvá na začátku náběh z ticha na plnou hlasitost. 0 = bez náběhu.',
  'Fade out': 'Postupné zeslabení',
  'Seconds to go quiet at the end. 0 = no fade.': 'Kolik sekund trvá na konci dozvuk do ticha. 0 = bez dozvuku.',
  'How much data is used per second of sound. Higher sounds better but makes bigger files. 192 is good for music; 128 is plenty for speech.':
    'Kolik dat připadá na sekundu zvuku. Vyšší zní líp, ale soubor je větší. Na hudbu stačí 192, na mluvené slovo 128.',
  Bitrate: 'Datový tok',
  'Samples per second. Keep the original unless something needs a specific rate: 44.1 kHz is CD quality, 48 kHz is the video standard.':
    'Počet vzorků za sekundu. Nechte původní, pokud něco nevyžaduje konkrétní hodnotu: 44,1 kHz je kvalita CD, 48 kHz je standard u videa.',
  'Sample rate': 'Vzorkovací frekvence',
  'keep original': 'původní',
  'Mono mixes everything into one channel: half the size, and Minecraft needs mono for sounds that come from a direction. Stereo keeps left and right separate.':
    'Mono smíchá vše do jednoho kanálu: poloviční velikost a Minecraft potřebuje mono u zvuků, které mají znít z určitého směru. Stereo nechá levou a pravou stranu zvlášť.',
  Channels: 'Kanály',
  mono: 'mono',
  stereo: 'stereo',
  'Make audio bad': 'Zkazit zvuk',
  'Ruin a sound on purpose for memes: crunchy low quality, bass boosted, earrape, phone call, underwater or robotic. Works on videos too (takes their sound). Comes out as a small MP3.':
    'Schválně zkazte zvuk na memy: chrčivá nízká kvalita, bass boosted, earrape, telefonní hovor, pod vodou nebo robotický. Funguje i na videa (vezme jejich zvuk). Výsledek je malé MP3.',

  // ---- make video / audio bad ----
  'How bad': 'Jak moc zkazit',
  'How much quality is thrown away: a smaller picture, fewer frames, fewer colors and crunchier sound. “Unusable” is barely recognizable.':
    'Kolik kvality se zahodí: menší obraz, méně snímků, méně barev a chrčivější zvuk. „Nepoužitelné“ je sotva k poznání.',
  'How much quality is thrown away: fewer details and a duller, crunchier sound. “Unusable” sounds like an old phone in a tin can.':
    'Kolik kvality se zahodí: méně detailů a tupější, chrčivější zvuk. „Nepoužitelné“ zní jako starý telefon v plechovce.',
  'a bit': 'trochu',
  bad: 'špatně',
  awful: 'hrozně',
  unusable: 'nepoužitelné',
  'Sound effects': 'Zvukové efekty',
  'Pick any number, they all go on together (none picked = none). Bass boosted: huge, distorted bass. Earrape: as loud and distorted as it gets, careful with headphones. Phone call: thin, like through a phone. Underwater: only the low, muffled part. Crushed: robotic, like an old video game.':
    'Vyberte libovolný počet, použijí se všechny najednou (nic nevybráno = žádný). Bass boosted: obrovské, zkreslené basy. Earrape: tak hlasité a zkreslené, jak to jen jde, pozor na sluchátka. Telefon: tenký zvuk jako z telefonu. Pod vodou: jen hluboká, tlumená část. Rozdrcené: robotické, jako ze staré videohry.',
  'bass boosted': 'bass boosted',
  earrape: 'earrape',
  'phone call': 'telefon',
  underwater: 'pod vodou',
  crushed: 'rozdrcené',
  Picture: 'Obraz',
  "Blurry: shrunk and blown up again, smudgy. Pixelated: big blocky squares. Deep fried: crazy colors, way too sharp and noisy. It comes out {SHOW_SIDE}p so it isn't tiny in a chat.":
    'Rozmazané: zmenšené a zase zvětšené, rozpatlané. Pixelované: velké kostičky. Deep fried: šílené barvy, přeostřené a zrnité. Výsledek má {SHOW_SIDE}p, aby v chatu nebyl maličký.',
  blurry: 'rozmazané',
  pixelated: 'pixelované',
  'deep fried': 'deep fried',
  Sound: 'Zvuk',
  'Remove takes the sound out completely.': 'Odebrat úplně odstraní zvuk.',
  remove: 'odebrat',
  'Seconds (90) or minutes:seconds (1:30).': 'Sekundy (90) nebo minuty:sekundy (1:30).',
  'Cut off the beginning. {TIME_HELP} Empty starts at the beginning.': 'Ořízne začátek. {TIME_HELP} Prázdné = od začátku.',
  'Cut off the end: the time in the original where it should stop. {TIME_HELP} Empty goes to the end.': 'Ořízne konec: čas v originálu, kde má skončit. {TIME_HELP} Prázdné = až do konce.',
  'Make video bad': 'Zkazit video',
  'Ruin a video on purpose for memes: low quality, blurry, pixelated or deep fried, with bass boosted, earrape or phone call sound. Comes out as a small MP4.':
    'Schválně zkazte video na memy: nízká kvalita, rozmazané, pixelované nebo deep fried, se zvukem bass boosted, earrape nebo jako z telefonu. Výsledek je malé MP4.',

  // ---- video ----
  'Video converter': 'Převod videa',
  'Convert videos to MP4, WebM, MOV, MKV or GIF, make them smaller, cut them shorter or remove the sound. Runs on your computer, on one CPU core: long or 4K videos take a while.':
    'Převeďte videa do MP4, WebM, MOV, MKV nebo GIF, zmenšete je, zkraťte nebo odeberte zvuk. Běží na vašem počítači na jednom jádru procesoru: dlouhá nebo 4K videa chvíli trvají.',
  'MP4 plays everywhere (phones, Discord, browsers). WebM is for websites. MOV is for Apple apps, MKV keeps everything. GIF loops without sound.':
    'MP4 hraje všude (telefony, Discord, prohlížeče). WebM je pro weby. MOV je pro aplikace Apple, MKV zachová všechno. GIF se opakuje dokola bez zvuku.',
  Quality: 'Kvalita',
  'Keep: if only the format changes, the video is copied as it is: instant and no quality lost. Otherwise it’s re-encoded in high quality. The others make the file smaller step by step: “small file” is good for sending in chats.':
    'Ponechat: když se mění jen formát, video se zkopíruje beze změny, okamžitě a bez ztráty kvality. Jinak se překóduje ve vysoké kvalitě. Ostatní volby soubor postupně zmenšují: „malý soubor“ se hodí na posílání do chatu.',
  high: 'vysoká',
  balanced: 'vyvážená',
  'small file': 'malý soubor',
  Resolution: 'Rozlišení',
  'Makes the video smaller (never bigger). Works for upright phone videos too: 720p means the short side is 720 pixels.':
    'Zmenší video (nikdy nezvětší). Funguje i u videí na výšku z telefonu: 720p znamená, že kratší strana má 720 pixelů.',
  'Frame rate': 'Snímková frekvence',
  'Frames per second. Fewer makes a smaller file; 30 is fine for most videos, 60 for games.': 'Snímků za sekundu. Méně = menší soubor; na většinu videí stačí 30, na hry 60.',
  'More looks smoother but makes the GIF much bigger. 12 is a good balance.': 'Víc vypadá plynuleji, ale GIF bude mnohem větší. 12 je dobrý kompromis.',
  Width: 'Šířka',
  'Width of the GIF; the height follows. GIFs grow fast, so smaller is usually better.': 'Šířka GIFu, výška se dopočítá. GIFy rychle rostou, takže menší je většinou lepší.',
  'Cut off the end: the time in the original video where it should stop. Empty goes to the end.': 'Ořízne konec: čas v původním videu, kde má skončit. Prázdné = až do konce.',
  'Video & audio downloader': 'Stahování videa a zvuku',
  'Download videos and music from YouTube, SoundCloud, Twitch, Reddit, TikTok and 1800+ sites, like the Seal app: pick the quality or get just the sound as MP3 with its cover, whole playlists, subtitles, cut-out sponsors. Uses yt-dlp and aria2c (16 connections at once) on your computer, so it needs the site started with start.bat.':
    'Stahujte videa a hudbu z YouTube, SoundCloudu, Twitche, Redditu, TikToku a z víc než 1800 dalších webů, jako v aplikaci Seal: vyberte kvalitu, nebo jen zvuk jako MP3 s obalem, celé playlisty, titulky, bez sponzorských vstupů. Používá yt-dlp a aria2c (16 spojení najednou) na vašem počítači, takže web musí být spuštěný přes start.bat.',

  // ---- image ----
  'Image converter': 'Převod obrázků',
  'Convert images to PNG, JPG, WebP, ICO or BMP, including iPhone photos (HEIC), TIFF and SVG. Can also make them smaller, turn and mirror them. The photo’s hidden info (camera, GPS location) is removed.':
    'Převeďte obrázky do PNG, JPG, WebP, ICO nebo BMP, včetně fotek z iPhonu (HEIC), TIFF a SVG. Umí je také zmenšit, otočit a zrcadlit. Skryté údaje z fotek (fotoaparát, poloha GPS) se odstraní.',
  'Same keeps the format and just re-saves (with the quality below, that makes photos smaller). PNG keeps every pixel and transparency. JPG is smallest for photos, no transparency. WebP is smaller than both. ICO is for website and app icons. BMP is uncompressed, for old programs.':
    'Stejný ponechá formát a jen soubor znovu uloží (s kvalitou níže se fotky zmenší). PNG zachová každý pixel i průhlednost. JPG je u fotek nejmenší, ale bez průhlednosti. WebP je menší než oba. ICO je na ikony webů a aplikací. BMP je nekomprimovaný, pro staré programy.',
  same: 'stejný',
  'Lower means a smaller file with more visible compression blur. 80–90 usually looks the same as the original. (PNG files saved as “same” stay lossless.)':
    'Nižší znamená menší soubor s viditelnějším rozmazáním od komprese. 80–90 obvykle vypadá stejně jako originál. (Soubory PNG uložené jako „stejný“ zůstanou bezeztrátové.)',
  'Website favicon: 16, 32 and 48 px. App icon: every size up to 256 px, for Windows shortcuts and programs. Non-square pictures are centred with transparent edges.':
    'Favicon webu: 16, 32 a 48 px. Ikona aplikace: všechny velikosti až do 256 px, pro zástupce a programy ve Windows. Obrázky, které nejsou čtvercové, se vycentrují s průhlednými okraji.',
  'Icon sizes': 'Velikosti ikony',
  'app icon (16–256)': 'ikona aplikace (16–256)',
  'only 256': 'jen 256',
  'Turns the picture. Phone photos already come out the right way up.': 'Otočí obrázek. Fotky z telefonu už vyjdou správně natočené.',
  Rotate: 'Otočit',
  no: 'ne',
  '90° right': '90° doprava',
  '90° left': '90° doleva',
  'Mirrors the picture: left ↔ right, or upside down.': 'Zrcadlí obrázek: zleva doprava, nebo vzhůru nohama.',
  Mirror: 'Zrcadlit',
  'left ↔ right': 'vlevo ↔ vpravo',
  'top ↕ bottom': 'nahoře ↕ dole',
  'Only for .svg files: how big to draw them. 1× is the size written in the file; 4× is good for sharp icons and logos.':
    'Jen pro soubory .svg: jak velké je vykreslit. 1× je velikost uvedená v souboru; 4× se hodí na ostré ikony a loga.',
  'SVG size': 'Velikost SVG',
  'Resize image': 'Změna velikosti obrázku',
  'Scale images by percent or to exact pixel sizes. Big downscales stay sharp.': 'Změňte velikost obrázků v procentech nebo na přesné rozměry v pixelech. I velké zmenšení zůstane ostré.',
  'Percent scales the image by a factor. Pixels sets an exact width and/or height.': 'Procenta zvětší nebo zmenší obrázek v daném poměru. Pixely nastaví přesnou šířku a/nebo výšku.',
  'Resize by': 'Změnit podle',
  percent: 'procent',
  pixels: 'pixelů',
  'Below 100 makes it smaller, above 100 bigger. Enlarging can’t add detail; the image just gets softer.': 'Pod 100 obrázek zmenší, nad 100 zvětší. Zvětšení nepřidá detaily, obrázek jen změkne.',
  Scale: 'Měřítko',
  'Target width in pixels. 0 means work it out from the height.': 'Cílová šířka v pixelech. 0 = dopočítat z výšky.',
  'Target height in pixels. Leave it at 0 to work it out from the width, so the image isn’t stretched.': 'Cílová výška v pixelech. Nechte 0, ať se dopočítá ze šířky a obrázek se nedeformuje.',
  Height: 'Výška',
  '0 = auto': '0 = automaticky',
  'On: the image fits inside the width × height box without stretching. Off: it’s forced to exactly that size.':
    'Zapnuto: obrázek se vejde do rámečku šířka × výška bez deformace. Vypnuto: vynutí se přesně tato velikost.',
  'Keep aspect ratio': 'Zachovat poměr stran',
  'Same format keeps the original file type. Pick another to convert at the same time.': 'Stejný formát ponechá původní typ souboru. Vyberte jiný, a rovnou se převede.',
  'Save as': 'Uložit jako',
  'same format': 'stejný formát',
  'Background remover': 'Odstranění pozadí',
  'AI · colour · brush': 'AI · barva · štětec',
  'Remove the background of a photo: automatically with AI (runs on your computer), by clicking a colour with an adjustable tolerance, and fix the result by hand with an erase / restore brush. Save as a see-through PNG or on a colour.':
    'Odstraňte pozadí fotky: automaticky pomocí AI (běží na vašem počítači), kliknutím na barvu s nastavitelnou tolerancí, a výsledek dolaďte ručně štětcem, který maže a vrací. Uložte jako průhledné PNG nebo na barevném pozadí.',
  'GIF maker': 'Tvorba GIFů',
  'video / photos → .gif': 'video / fotky → .gif',
  'Make a GIF from a video clip or from photos, with meme text in any Google font and animated stickers you can move, resize and turn. Speed, boomerang, crop and more; the preview shows exactly what you’ll get, and you get a link to share it.':
    'Udělejte GIF z videa nebo z fotek, s meme textem v libovolném písmu Google a animovanými nálepkami, které jde posouvat, zvětšovat a otáčet. Rychlost, bumerang, oříznutí a další; náhled ukazuje přesně to, co dostanete, a získáte i odkaz ke sdílení.',

  // ---- pdf ----
  'Compress PDF': 'Komprimovat PDF',
  'smaller .pdf': 'menší .pdf',
  'Make PDFs smaller. “Keep text” only shrinks the pictures inside, so text stays sharp and selectable. “Redraw pages” turns every page into a compressed picture: the smallest result for scans, but the text can’t be selected afterwards.':
    'Zmenšete PDF. „Zachovat text“ zmenší jen obrázky uvnitř, takže text zůstane ostrý a půjde označit. „Překreslit stránky“ udělá z každé stránky komprimovaný obrázek: nejmenší výsledek u skenů, ale text pak nejde označit.',
  Method: 'Způsob',
  'Keep text: only the pictures inside are made smaller; text and drawings stay sharp and can be selected and searched. Redraw pages: every page becomes a picture, the smallest file for scans, but the text can’t be selected afterwards.':
    'Zachovat text: zmenší se jen obrázky uvnitř; text a kresby zůstanou ostré a půjde je označit i vyhledávat. Překreslit stránky: z každé stránky bude obrázek, nejmenší soubor u skenů, ale text pak nejde označit.',
  'keep text': 'zachovat text',
  'redraw pages': 'překreslit stránky',
  Compression: 'Komprese',
  'Strong gives the smallest file; small print or pictures can get blurry. Light keeps more detail but saves less.': 'Silná dá nejmenší soubor; drobné písmo nebo obrázky se můžou rozmazat. Slabá zachová víc detailů, ale ušetří méně.',
  strong: 'silná',
  light: 'slabá',
  'Black & white': 'Černobíle',
  'Removes the color (of the pictures, or of the whole pages when redrawing), which makes them even smaller.': 'Odstraní barvy (z obrázků, nebo při překreslení z celých stránek), takže soubor bude ještě menší.',
  'This PDF is already small ({size}; it’s probably mostly text): compressing would make it bigger ({bigger}).': 'Tohle PDF je už malé ({size}; nejspíš je to hlavně text): komprese by ho zvětšila ({bigger}).',
  '“Strong” might still help.': 'Možná pomůže ještě „silná“.',
  'Images to PDF': 'Obrázky do PDF',
  '.jpg → .pdf · scan': '.jpg → .pdf · sken',
  'Turn photos into a PDF, one per page. Photos of paper become clean scans: the sheet is found (or you drag its corners), straightened and made white, or only what’s written on it is put on a clean page inside the margins.':
    'Udělejte z fotek PDF, každou na jednu stránku. Z fotek papíru budou čisté skeny: list se najde (nebo přetáhnete jeho rohy), narovná a vybělí, nebo se jen to, co je na něm napsané, položí na čistou stránku s okraji.',
  'Merge PDF': 'Sloučit PDF',
  'Combine PDFs into one file. Pages keep the order you pick the files in.': 'Spojte víc PDF do jednoho souboru. Stránky budou v pořadí, v jakém soubory vyberete.',
  'Organize PDF': 'Uspořádat PDF',
  'move · turn · delete': 'přesunout · otočit · smazat',
  'See every page of a PDF and fix it: drag pages into a new order, turn the ones that are sideways, delete or duplicate pages, add empty pages, or put pages of several PDFs together.':
    'Prohlédněte si každou stránku PDF a upravte ji: přetáhněte stránky do nového pořadí, otočte ty, které jsou bokem, mažte nebo duplikujte stránky, přidejte prázdné, nebo spojte stránky z více PDF.',
  'PDF to images': 'PDF na obrázky',
  'Turn PDF pages into PNG or JPG pictures, all of them or only the pages you pick. Several pages download as one .zip.': 'Převeďte stránky PDF na obrázky PNG nebo JPG, všechny, nebo jen vybrané. Víc stránek se stáhne jako jeden .zip.',
  'PNG is sharpest for text and drawings. JPG is much smaller for scans and photos.': 'PNG je nejostřejší na text a kresby. JPG je u skenů a fotek mnohem menší.',
  'Dots per inch. 150 is good for the screen, 300 for printing or zooming in. Higher makes bigger files.': 'Body na palec. 150 stačí na obrazovku, 300 na tisk nebo přibližování. Vyšší = větší soubory.',
  'Lower makes smaller JPG files with more blur.': 'Nižší = menší soubory JPG, ale rozmazanější.',
  Pages: 'Stránky',
  'Empty takes every page. Otherwise e.g. 1-3, 5 or 7- (to the end).': 'Prázdné = všechny stránky. Jinak třeba 1-3, 5 nebo 7- (do konce).',
  all: 'všechny',
  'Split PDF': 'Rozdělit PDF',
  'one → several': 'jedno → víc',
  'Cut a PDF into several PDFs: click between pages where it should split, or split it into single pages, every few pages or in half. Or pick pages and save just those.':
    'Rozdělte PDF na víc souborů: klikněte mezi stránky, kde se má rozdělit, nebo ho rozdělte po jednotlivých stránkách, po několika stránkách nebo napůl. Nebo vyberte stránky a uložte jen ty.',

  // ---- calc, dev ----
  'QR code maker': 'Tvorba QR kódů',
  'link · Wi-Fi · contact · styles': 'odkaz · Wi-Fi · kontakt · styly',
  'Make a QR code for a link, text, Wi-Fi, a contact, an e-mail, an SMS, a place, an event or a payment, in any colours and shapes, with your logo and a frame. It checks that phones can still read it.':
    'Udělejte QR kód pro odkaz, text, Wi-Fi, kontakt, e-mail, SMS, místo, událost nebo platbu, v libovolných barvách a tvarech, s vaším logem a rámečkem. Sám zkontroluje, že ho telefony pořád přečtou.',
  'Base64 encode / decode': 'Base64 kódování / dekódování',
  'Encode text or files to Base64 and decode it back. Handles Unicode and the URL-safe alphabet.': 'Zakódujte text nebo soubory do Base64 a zase zpátky. Zvládá Unicode i abecedu bezpečnou pro URL.',
  'JSON formatter & validator': 'Formátování a kontrola JSON',
  'Pretty-print, minify or sort JSON, and see exactly where it breaks when it’s invalid.': 'Přehledně naformátujte, zmenšete nebo seřaďte JSON a uvidíte přesně, kde je chyba, když je neplatný.',
  'UUID generator': 'Generátor UUID',
  'Generate random v4 or time-ordered v7 UUIDs, one or a hundred at a time.': 'Vytvořte náhodná UUID v4 nebo časově řazená v7, jedno nebo sto najednou.',

  // ---- minecraft ----
  'AdvancedServerList profile generator': 'Generátor profilů AdvancedServerList',
  'Build a profile for the AdvancedServerList plugin: MOTD, player count, hover text, favicon and conditions, with a live server-list preview.':
    'Sestavte profil pro plugin AdvancedServerList: MOTD, počet hráčů, text při najetí myší, favicon a podmínky, s živým náhledem seznamu serverů.',
  'Chunk & region finder': 'Hledání chunků a regionů',
  'Find the chunk, section and region file (.mca) a block is in.': 'Zjistěte, ve kterém chunku, sekci a souboru regionu (.mca) blok leží.',
  'Circle & shape generator': 'Generátor kruhů a tvarů',
  'circles · spheres · domes': 'kruhy · koule · kopule',
  'Block-by-block guides for circles, ovals, polygons, stars and hearts, and layer by layer for spheres, domes, cylinders, cones, pyramids and donuts, with block counts.':
    'Návody blok po bloku pro kruhy, ovály, mnohoúhelníky, hvězdy a srdce a vrstvu po vrstvě pro koule, kopule, válce, kužele, pyramidy a donuty, i s počtem bloků.',
  'Color codes & MiniMessage': 'Barevné kódy a MiniMessage',
  'Every color and format code with its MiniMessage tag, plus a converter between the two.': 'Všechny kódy barev a formátování s jejich značkou MiniMessage a převod mezi nimi.',
  'Give command generator': 'Generátor příkazu /give',
  'Build a custom item: name and lore with colors, enchantments, attributes, potions, trims, books, fireworks and spawn eggs with your own mob, then copy the /give command. Preview shows the tooltip like in game.':
    'Sestavte vlastní item: barevný název a lore, enchanty, atributy, lektvary, trimy, knihy, ohňostroje a spawn eggy s vlastním mobem, a zkopírujte příkaz /give. Náhled ukazuje popisek jako ve hře.',
  'Map art converter': 'Převod na map art',
  'image → .litematic': 'obrázek → .litematic',
  'Turn a picture into Minecraft map art: see it in map colors, get the block list, and download a .litematic or .nbt to build from.':
    'Udělejte z obrázku map art pro Minecraft: uvidíte ho v barvách mapy, dostanete seznam bloků a stáhnete .litematic nebo .nbt na stavění.',
  'MOTD generator': 'Generátor MOTD',
  '§ codes': '§ kódy',
  'Write a colored two-line server MOTD, preview it like the server list, and copy it for server.properties.': 'Napište barevné dvouřádkové MOTD serveru, prohlédněte si ho jako v seznamu serverů a zkopírujte ho do server.properties.',
  'Nether portal calculator': 'Výpočet nether portálu',
  'Work out where to build a linked portal: Overworld coordinates divide by 8 in the Nether.': 'Spočítejte, kde postavit propojený portál: souřadnice z Overworldu se v Netheru dělí osmi.',
  'Player head command': 'Příkaz na hlavu hráče',
  'Get the /give command for any player’s head, in the right syntax for your version.': 'Získejte příkaz /give na hlavu libovolného hráče, ve správném zápisu pro vaši verzi.',
  'Seed map': 'Mapa seedu',
  'seed → map': 'seed → mapa',
  'See the biomes of any Java world seed and where villages, temples, monuments, ancient cities and other structures are. Click a spot for its coordinates.':
    'Podívejte se na biomy libovolného seedu světa v Javě a na to, kde jsou vesnice, chrámy, monumenty, ancient city a další stavby. Kliknutím na místo získáte jeho souřadnice.',
  'server.properties editor': 'Editor server.properties',
  'Open your server.properties or start from the defaults, change settings with real controls, and save the file.': 'Otevřete svůj server.properties nebo začněte od výchozích hodnot, nastavte vše pohodlně přes ovládací prvky a soubor uložte.',
  'Server status checker': 'Stav serveru',
  'Check if a Minecraft server is online and see its players, version and MOTD.': 'Zjistěte, jestli je Minecraft server online, a podívejte se na jeho hráče, verzi a MOTD.',
  'Skin editor': 'Editor skinů',
  'Paint a skin right on the 3D player, open two skins at once and copy a hat, jacket or any piece from one to the other. Ctrl+Z undoes anything.':
    'Malujte skin přímo na 3D postavě, otevřete dva skiny najednou a přeneste klobouk, bundu nebo jakýkoli kus z jednoho na druhý. Ctrl+Z vrátí cokoli.',
  'Skin viewer & downloader': 'Prohlížení a stažení skinů',
  'See any Java player’s skin from the front, as a head, or as the raw texture, and save the PNG.': 'Podívejte se na skin libovolného hráče v Javě zepředu, jako hlavu nebo jako samotnou texturu a uložte PNG.',
  'Slime chunk finder': 'Hledání slime chunků',
  'Map the slime chunks around you from your world seed (Java Edition).': 'Zobrazte slime chunky kolem sebe podle seedu světa (Java Edition).',
  'Stack & shulker calculator': 'Výpočet stacků a shulkerů',
  'items → stacks': 'itemy → stacky',
  'Turn an item count into stacks, shulker boxes and double chests, and back.': 'Převeďte počet itemů na stacky, shulker boxy a dvojité truhly a zpátky.',
  'Player UUID lookup': 'Vyhledání UUID hráče',
  'name → uuid': 'jméno → uuid',
  'Find a Java player’s UUID from their name, or the name from a UUID. Also gives the offline-mode UUID.': 'Najděte UUID hráče v Javě podle jména, nebo jméno podle UUID. Ukáže i UUID pro offline režim.',
  'XP level calculator': 'Výpočet XP levelů',
  'levels ⇄ points': 'levely ⇄ body',
  'Convert experience levels to points and back, and see how much XP a level range costs.': 'Převeďte levely zkušeností na body a zpátky a zjistěte, kolik XP stojí rozsah levelů.',
} as Record<string, string>;
