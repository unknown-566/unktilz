// What counts as a text to translate (used by i18n-check.mjs).

/** JSX attributes people read. */
export const UI_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'help', 'hint', 'text', 'caption', 'emptyText', 'saveLabel', 'loadLabel', 'description', 'note', 'heading', 'action', 'empty']);
/** Properties of tool definitions (*.tool.ts) shown on the pages. */
export const TOOL_PROPS = new Set(['name', 'meta', 'description', 'label', 'help', 'hint', 'placeholder', 'note']);
/** Properties of other objects that hold texts people read. */
export const OBJ_PROPS = new Set(['label', 'help', 'hint', 'title', 'description', 'placeholder', 'note', 'tip', 'error', 'message', 'text', 'detail']);
/** Functions whose text argument is shown: dialogs and the usual state setters for messages. */
export const SHOW_CALLS = /^(window\.)?(confirm|alert|prompt)$|^set(Err|Error|Errors|Note|Msg|Message|Status|Warn|Warning|Hint|Info|Copied|Notice|Problem|Fail|Failed)$|^(onStatus|status|say)\??\.?$/;
/** Component props whose default value is shown. */
export const PROP_DEFAULTS = new Set(['title', 'label', 'saveLabel', 'emptyText', 'loadLabel', 'placeholder', 'help', 'text', 'caption', 'empty', 'action']);

/** Names that stay as they are. */
export const NAMES = new Set(['unktilz', 'unknown_56', 'GitHub', 'YouTube', 'Minecraft', 'Discord', 'Base64', 'JSON', 'UUID', 'Google Fonts', 'Noto Emoji Animation', 'yt-dlp', 'aria2c', 'ffmpeg', 'bin', 'SponsorBlock', 'PATH', 'Litematica', 'Paper', 'Velocity', 'BungeeCord', 'AdvancedServerList', 'HMAC', 'hex', 'HEX', 'bcrypt', 'scrypt', 'Argon2i', 'Argon2d', 'Ascii85', 'XChaCha20-Poly1305', 'IV / nonce']);
const FORMATS = new Set(['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac', 'opus', 'webm', 'mp4', 'mkv', 'mov', 'avi', 'gif', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'tiff', 'tif', 'ico', 'svg', 'pdf', 'heic', 'heif', 'json', 'csv', 'txt', 'zip', 'srt', 'vtt', 'nbt', 'snbt', 'html', 'css', 'px', 'kb', 'mb', 'gb', 'fps', 'dpi', 'hz', 'khz', 'kbps', 'ms']);

/** File formats, codes and units ('mp3', 'PNG', 'A4', '1080p'), names and HTML entities. */
export const techy = (s) => {
  const v = s.trim();
  if (NAMES.has(v) || NAMES.has(v.replace(/^[\s·•,;:()]+|[\s·•,;:()]+$/g, '')) || /^(&\w+;\s*)+$/.test(v)) return true;
  if (/^\.?[a-z0-9]{1,5}$/i.test(v) && (/\d/.test(v) || FORMATS.has(v.replace(/^\./, '').toLowerCase()))) return true;
  // Web addresses and shortcuts: "minecraft.net", "Ctrl+Z".
  if (/^[\w-]+(\.[\w-]+)+$/.test(v) || /^(Ctrl|Shift|Alt|⌘)(\s*\+\s*\w+)+$/.test(v)) return true;
  // Folders and commands: ".minecraft/schematics/", "/place template …".
  if (/^\/[a-z]/.test(v) || /^[\w.~-]*\/[\w./-]*$/.test(v)) return true;
  // A unit between separators: "fps ·", "(px)".
  if (FORMATS.has(v.replace(/[\s·•,;:()]+/g, '').toLowerCase())) return true;
  // All capitals with digits or symbols: "A4", "H.264", "MP4 / H.264".
  return /^[A-Z0-9 .+\-/×:%]+$/.test(v) && /[\d.+\-/×:%]/.test(v);
};
// (Markup like "<italic>{x}</italic>" has no words of its own.)
export const wordy = (s) => !techy(s) && (/[A-Za-z]{2,}/.test(s.replace(/\{\w+\}/g, '').replace(/https?:\/\/\S+/g, '').replace(/<\/?[\w:#-]+>/g, '')) || /\be\.g\./.test(s));
