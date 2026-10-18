# Changelog

What changed in each version of unktilz. Version numbers go up like this: the middle number for new features, the last number for fixes.

## [1.11.0] - 2026-10-18

### Added
- **Fonts from Google in the GIF maker:** pick any of about 1,800 Google Fonts for your texts. Search them or browse by kind (display, handwriting, pixel…); each name is written in its own font.
- Ten fonts come with the site and work without the internet: Anton, Bebas Neue, Bangers, Luckiest Guy, Montserrat, Lobster, Pacifico, Caveat, Permanent Marker and Press Start 2P. All but Permanent Marker have Czech letters (č, ř, ž…).
- **A link to your GIF, made by itself:** after "Make GIF" the GIF is uploaded and you get a link to paste anywhere (Discord shows it as a GIF). It's copied for you when the browser allows it. Pick how long it works: forever, 3 days, 1 day, 12 hours or 1 hour, or turn "Make a link" off.
- "My links" keeps your last 20 links, with how long each one still works.

## [1.10.0] - 2026-10-18

### Added
- **Stickers in the GIF maker:** almost 900 animated emoji from Google (search them, or browse by group; they move when you hover them), and your own stickers: add any PNG, GIF or WebP, animated ones too (e.g. saved from Giphy). Your stickers are kept in "my stickers" and in Backup.
- **Edit right on the preview:** click a text or sticker to select it, then drag it to move it (it snaps to the middle), drag a corner to resize it, or the round handle to turn it (hold Shift for 15° steps).
- Keyboard: arrow keys nudge (Shift moves further), Delete removes, Ctrl+D duplicates, Ctrl+] and Ctrl+[ bring forward and send back, Esc deselects.
- A **layers** list: order, duplicate and delete, plus size, turn, opacity and mirror for each layer.
- New animations for texts and stickers: fade in, spin, wiggle, pulse and float. They loop smoothly with the GIF.

### Changed
- The old static emoji picker is replaced by the animated stickers. Texts you saved before still load.

## [1.9.0] - 2026-10-18

### Added
- **GIF maker**, like Giphy: make a GIF from a video clip (pick the part with two handles on the timeline) or from photos (a slideshow, with fades between them).
  - Meme text, subtitles, neon and speech-bubble styles, emoji stickers, and text that types itself, pops in or blinks. Drag texts on the preview to place them.
  - Crop to square, 16:9, 9:16 or 4:5 (drag the preview to choose the part), speed from 0.25× to 4×, backwards, boomerang and filters.
  - Width, frames per second, number of colors and how many times it plays. The preview plays exactly what you'll get.
  - Videos the browser can't play (AVI, some iPhone videos) are converted first. "My GIF styles" saves your texts and settings.

## [1.8.0] - 2026-10-18

### Added
- **Seed map full screen:** a new button in the map's corner fills the whole screen with the map. Esc goes back.

### Changed
- Typing in the tool search on the home page scrolls the search box up, so the matching tools show right under it and you can just click one.

### Removed
- The "Add process" (+) button in the queue panel. It didn't work well; open a tool and add files there instead.

## [1.7.0] - 2026-10-15

### Changed
- **The preview shows the real result**, made with exactly your settings: size, quality, format (e.g. JPG turns transparent parts white), turning and mirroring, plus how big the file will be. It updates a moment after you change something.
- "100 %" shows the real pixels (to check sharpness and compression), and holding "original" shows the picture you started with.

### Added
- Previews in PDF to images, Compress PDF (how the first page will look) and Images to PDF (the photo cleaned up as a scanned page).

## [1.6.0] - 2026-10-15

### Added
- **Image preview** in the image converter and Resize image: the picked picture shows above the options and turns or mirrors right away as you change them, with the size it will come out at (e.g. 1920 × 1080 → 1280 × 720 px). With several pictures you can flip through them. Works for HEIC and TIFF too.

## [1.5.0] - 2026-10-15

### Added
- **PDF to images:** turn PDF pages into PNG or JPG, all of them or just the ones you pick, at 72, 150 or 300 dpi.
- **Split & organize PDF:** pick pages and put them in another order, remove pages, split a PDF into one file per page or into groups, and turn pages that are sideways.
- **Compress PDF:** makes scanned PDFs much smaller (e.g. 10 MB → 0.6 MB), optionally in black & white. It tells you when a PDF is already as small as it gets.

## [1.4.0] - 2026-10-15

### Added
- **Image converter** reads iPhone photos (HEIC), TIFF, ICO and SVG, and can save ICO (favicons and app icons with all sizes in one file) and BMP too.
- Turn images 90° / 180° and mirror them.
- "Same format" re-saves an image at the chosen quality, which makes photos smaller.
- Resize image and Images to PDF also take HEIC and TIFF now.

### Changed
- Converting removes the photo's hidden info (camera, GPS location). The description now says so.

## [1.3.0] - 2026-10-15

### Added
- **Audio converter:** MP3, WAV, OGG, Opus, FLAC and M4A from almost any sound file, or take the sound out of a video (MP4 to MP3 and so on). It can also cut the sound shorter, fade it in and out, make it louder or quieter, even out the volume (normalize), and switch between mono and stereo.

### Changed
- "OGG to MP3" and "MP3 to OGG" are now part of the audio converter. Old links still work.

### Fixed
- After one failed conversion, the next video or audio conversion could fail too. Each one now starts fresh.

## [1.2.0] - 2026-10-15

### Added
- **Video converter:** MP4, WebM, MOV, MKV and GIF from almost any video (MOV, MKV, AVI, WebM, iPhone videos…). It can also make videos smaller (quality and resolution), cut them shorter, lower the frame rate and remove the sound. When only the format changes, the video is copied as it is: instant, with no quality lost.

### Changed
- "Video to GIF" is now part of the video converter. Old links still work and open it with GIF picked.

## [1.1.0] - 2026-10-15

### Added
- **Custom spawn eggs** in the give command generator: pick any spawn egg and a new "Spawns" tab lets you choose what comes out. That can be any mob, with a colored name, more health, speed, attack damage or a different size, armor and weapons (including your saved items with all their enchantments) and a drop chance for each one, effects, and behaviour like no AI, silent, glowing, never despawns or baby.
- A "Boss zombie" preset to show what it can do.
- The command uses the right format for your Minecraft version (1.20.5 – 26.3).

## [1.0.0] - 2026-10-15

The first numbered version. Everything so far:

### Added
- **Saving everywhere it makes sense:** "my items" in the give command generator, "my MOTDs", "my texts" (color codes), "my configs" (server.properties), "my profiles" (AdvancedServerList), favourite servers in server status, a skin library in the skin editor, and saved seeds and places in the seed map.
- **Work in progress is kept:** the generators remember what you were doing, even after closing the browser.
- **Backup page** (footer): download everything you saved as one file and load it on another computer.
- **Versions and this changelog**, with a "Check for updates" button and a small "update available" note in the header.
- **Give command generator** for Java 1.20.5 – 26.3: custom names and lore with colors, enchantments up to level 255, attributes, potions, dyes, trims, player heads, books, fireworks, adventure mode and a tooltip preview like in game.
- **Seed map** for Java 1.16 – 26.3: biomes, 16 structure types with icons, world spawn, hover for coordinates, click to copy "X Y Z" with the real ground height.
- **Skin editor:** paint on the 3D player or the flat texture, two skins at once, copy parts between them, undo history.
- **Map art converter** with .litematic and .nbt export.
- Minecraft tools: server status, skin viewer, UUID lookup, player head, MOTD generator, color codes and MiniMessage, AdvancedServerList profiles, nether portal, chunk finder, slime chunks, circles and spheres, XP and stack calculators, server.properties editor.
- File tools that run on your computer: image converter and resizer, OGG ⇄ MP3, video to GIF, merge PDFs, images to PDF (with paper scan cleanup).
- start.bat and update.bat: run and update the site with a double-click, installing Node.js if it's missing.

### Changed
- The home page says the tools run locally and marks the few that need the internet.
- Green block caret in every text field.
- The site always runs on localhost:5173, so saved things are still there after updating.
