# Changelog

What changed in each version of unktilz. Version numbers go up like this: the middle number for new features, the last number for fixes.

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
