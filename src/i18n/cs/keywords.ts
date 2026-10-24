// Czech search words for each tool ("keywords:<slug>", read by matches() in src/registry/index.ts).
// Search ignores accents and letter case and finds parts of words, so list the full forms people
// type (sloučit, sloučení, spojit…) and other words for the same thing. The tool's Czech name,
// meta and English keywords are searched too, no need to repeat them.

export default {
  // ---- audio ----
  'keywords:audio-converter': 'převést zvuk převádění převodník konvertor konvertovat konverze audio hudba hudbu písnička písničku nahrávka zvukový soubor změnit formát',
  'keywords:bad-audio': 'zkazit zvuk zničit pokazit zkreslení zkreslit hlasitý nahlas uši basy zesílit basy rozbitý zvuk vtip meme',

  // ---- video ----
  'keywords:video-converter': 'převést video převádění převodník konvertor konvertovat konverze formát videa zmenšit video zvuk z videa video na gif',
  'keywords:bad-video': 'zkazit video zničit video pokazit nízká kvalita rozmazané zkreslení vtip meme',
  'keywords:downloader': 'stahování stáhnout stažení stahovač video videa hudba hudbu písnička písničky zvuk z youtube na mp3 playlist titulky',

  // ---- PDF ----
  'keywords:merge-pdf': 'sloučit sloučení spojit spojení dohromady připojit jeden soubor více souborů dokument dokumenty',
  'keywords:split-pdf': 'rozdělit rozdělení oddělit vyjmout vybrat stránky extrahovat stránky rozříznout více souborů dokument',
  'keywords:organize-pdf': 'uspořádat uspořádání seřadit pořadí stránek přesunout otočit otočení smazat stránky odstranit stránky upravit pdf dokument',
  'keywords:compress-pdf': 'komprimovat komprese zkomprimovat zmenšit zmenšení menší soubor velikost dokument',
  'keywords:images-to-pdf': 'obrázky do pdf fotky do pdf fotka převést sken skenování naskenovat vytvořit pdf jpg na pdf rozpoznání textu ocr dokument',
  'keywords:pdf-to-images': 'pdf na obrázky převést stránky jako obrázky pdf na jpg pdf na png vytáhnout obrázky export dokument',

  // ---- image ----
  'keywords:image-converter': 'převést obrázek obrázků převádění převodník konvertor konvertovat konverze fotka fotku fotky formát ikona změnit formát',
  'keywords:resize-image': 'změnit velikost zmenšit zvětšit zmenšení zvětšení obrázek fotku fotky rozlišení pixely menší soubor',
  'keywords:crop-image': 'oříznout oříznutí ořez ořezat výřez vyříznout oříznout fotku obrázek fotka čtverec kruh kulatý profilovka profilový obrázek avatar poměr stran otočit zrcadlit převrátit screenshot instagram',
  'keywords:bg-remover': 'odstranit pozadí smazat pozadí odebrat pozadí bez pozadí průhledné pozadí průhlednost vyříznout fotka fotku obrázek umělá inteligence',
  'keywords:gif-maker': 'vytvořit gif udělat gif gify animace animovaný obrázek z videa z fotek fotky popisek text meme',

  // ---- dev ----
  'keywords:encode-encrypt': 'šifra šifry šifrování zašifrovat šifrovat rozšifrovat dešifrovat dešifrování kódování zakódovat dekódovat heslo hesla hash hashe kontrolní součet otisk souboru tajná zpráva tajné písmo morseovka morseova abeceda caesarova šifra posun písmen převod na binárku dvojková soustava šestnáctková ověřit stažený soubor klíč',
  'keywords:json-formatter': 'formátovat zformátovat formátování kontrola zkontrolovat ověřit validace chyba odsazení zmenšit minifikace',
  'keywords:uuid-generator': 'vygenerovat vytvořit generovat náhodné id identifikátor unikátní guid',

  // ---- calc & generators ----
  'keywords:qr-code': 'qr kód kódy vytvořit vygenerovat generátor odkaz wifi heslo kontakt vizitka platba e-mail sms poloha místo událost logo naskenovat čárový kód',

  // ---- Minecraft ----
  'keywords:advanced-server-list': 'seznam serverů profil profily ikona serveru počet hráčů popis serveru generátor',
  'keywords:chunk-finder': 'najít chunk hledat souřadnice region soubor regionu svět',
  'keywords:circle-generator': 'kruh kruhy koule kopule tvar tvary elipsa válec stavba stavění',
  'keywords:color-codes': 'barvy barva barevný text barva textu formátování textu chat tučné kurzíva přechod duha',
  'keywords:give-generator': 'příkaz dát předmět předměty očarování očarovaný meč nástroj brnění generátor příkazů',
  'keywords:summon-generator': 'vyvolat příkaz entita entity mob moby jezdec jezdci vesničan obchod obchody armor stand póza hologram plovoucí text creeper boss generátor příkazů',
  'keywords:tellraw-generator': 'zpráva zprávy chat titulek nadpis podnadpis action bar barevný text klikací odkaz najetí myší json text příkaz generátor příkazů',
  'keywords:setblock-generator': 'položit blok bloky vyplnit oblast cedule truhla spawner command block hlava stavy bloku vyplnění generátor příkazů',
  'keywords:map-art': 'mapa mapy obrázek na mapu obraz převést obrázek stavba schematic',
  'keywords:motd-generator': 'zpráva serveru popis serveru uvítací text barevný text',
  'keywords:nether-portal': 'portál portály souřadnice přepočet propojit portály spojit portály výpočet',
  'keywords:player-head': 'hlava hlavu hráče lebka skin příkaz dekorace',
  'keywords:seed-map': 'mapa světa seed biomy struktury vesnice najít vesnici svět',
  'keywords:server-properties': 'nastavení serveru konfigurace upravit vlastnosti',
  'keywords:server-status': 'je server online ping hráči online zjistit kontrola serveru stav',
  'keywords:skin-editor': 'upravit skin kreslit skin vytvořit skin malovat postava',
  'keywords:skin-viewer': 'stáhnout skin stažení skinu zobrazit skin náhled skinu prohlížeč hráč',
  'keywords:slime-chunks': 'sliz slizy farma najít hledat seed',
  'keywords:stack-calculator': 'kalkulačka počet kusů předmětů truhla truhly kolik stacků přepočet',
  'keywords:uuid-lookup': 'zjistit uuid najít hráče jméno hráče přezdívka nick',
  'keywords:xp-calculator': 'kalkulačka zkušenosti zkušenostní body úroveň úrovně level levely kolik xp',
} as Record<string, string>;
