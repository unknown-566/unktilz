# Changelog

What changed in each version of unktilz. Version numbers go up like this: the middle number for new features, the last number for fixes.

## [1.15.0] - 2026-10-19

### Added
- Circle generator is now the Circle & shape generator: besides circles, ovals and spheres it makes polygons (triangle to 12 sides), stars, hearts, and layer by layer domes, cylinders, cones, pyramids, eggs and donuts. Layers count from the bottom, and the guide shows blocks for this layer and the whole shape.
- Shape generator: 3D shapes can be seen in 3D (drag to turn, + / − to zoom). The layer you're building glows, the layers below stay solid and the ones above turn see-through. Scroll the mouse wheel over the guide to move through the layers; in the flat layer view the layer below shows faintly.

### Changed
- Every link between the site's pages now opens with the block transition: All tools and Request a tool at the top, the tools / category links above a tool, the queue, the 404 page, the what's-new popup and "edit in skin editor".

### Fixed
- Make video bad: fixed "Error submitting audio frame to the encoder". The sound is now always turned into a plain, steady format before it's encoded, and if making the video still fails it's tried again by itself (and as a last resort with MP3 sound).

## [1.14.0] - 2026-10-19

### Added
- Make video bad and Make audio bad: ruin a video or a sound on purpose for memes. Pick how bad (from "a bit" to "unusable"), a look for videos (blurry, pixelated or deep fried) and a sound effect (bass boosted, earrape, phone call, underwater or crushed). Videos come out as a small MP4, sounds as an MP3, and the audio one also takes the sound out of a video.
- Home page: New and Beta filters next to the categories. They work together with the categories, e.g. PDF + Beta shows only the PDF tools still in testing.

### Changed
- Home page: clicking a picked filter no longer unpicks it. Only its small × does, so a misclick can't hide what you picked.
- The version and backup links at the bottom open with the same block transition as the tools, and "unknown_56" links to the GitHub profile (opens in a new tab).
- Only tools that are really new wear the "new" tag now (GIF maker, Make video bad, Make audio bad).
- Home page: the new / beta / online tags always sit on the right of a tool's card, also when a long description pushes them onto their own line.

## [1.13.1] - 2026-10-19

### Changed
- Home page: the category buttons switch on and off, so you can show several categories at once (e.g. Image and PDF). A small × on a picked one unpicks it, and "All" shows everything again.

## [1.13.0] - 2026-10-19

### Added
- **"New" and "beta" tags:** tools that came out in the last 5 days say "new" (it goes away by itself), and tools still being tested say "beta": the GIF maker and all PDF tools for now.
- **What's new popup:** after the site updates, this list shows once.

### Changed
- **The GIF maker uses the queue** like the other tools: "Make GIF" puts it in the queue panel with its progress, it never runs at the same time as another video job, × stops it, and you can leave the page while it's made; the GIF waits in the queue to download.

## [1.12.4] - 2026-10-19

### Fixed
- Memory that was never given back:
  - GIF maker stickers stayed in memory after their layer was deleted and after leaving the page (about 10 MB per animated emoji). They are now freed a few seconds after nothing uses them.
  - The video, audio and GIF tools kept ffmpeg's memory (up to hundreds of MB after a big job) until the page was closed. It is now freed 30 seconds after the last job.
  - The GIF maker keeps at most about 150 MB of video frames outside the chosen clip.
  - Video thumbnails, photos or a video still loading when you leave the GIF maker are freed too.

## [1.12.3] - 2026-10-18

### Removed
- GIF maker: imgur links. imgur no longer lets anyone get the Client ID they need (its sign-up page just goes back to the home page). Links go to catbox.moe again; to post a GIF on Discord, drag it in.

## [1.12.2] - 2026-10-18

### Fixed
- GIF maker: the filter (black & white, sepia, punchy) now colors texts and stickers too, not just the video or photos.

## [1.12.1] - 2026-10-18

### Changed
- GIF maker: how to get an imgur Client ID is now step by step under the field, with a link you can click or copy. The "?" only says what a Client ID is.

## [1.12.0] - 2026-10-18

### Added
- GIF maker: **drag the finished GIF straight into Discord** (or any chat, or a folder). It goes in as a real file, so it always shows, in DMs too.
- **imgur links:** pick "imgur" under "Make a link" and Discord shows the link as a GIF. imgur needs a free Client ID of your own (the "?" says how to get one). imgur GIFs can be deleted again from "my links".

### Changed
- The catbox note says Discord may show catbox links as just a link.

## [1.11.2] - 2026-10-18

### Changed
- GIF maker: the video strip at the top shows a line where the preview is playing.
- Making the clip shorter no longer reads the video again: the preview just plays the shorter part right away. Making it longer only reads the new part.

## [1.11.1] - 2026-10-18

### Changed
- GIF maker: **when a text or sticker shows** is now a bar over the whole GIF. Drag its two ends (or the middle to move it); a thin line shows where the preview is playing. No more typing seconds.
- Every choice in the GIF maker now says what it is (shape, speed, filter, width, frames per second, plays, style, animation), with a "?" that explains it.

### Fixed
- The animated emoji list got very slow: every emoji the mouse passed over kept playing. Now only the one under the mouse moves.

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
