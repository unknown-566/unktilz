import { defineTool, lazyTool } from '../../registry/types';
import { t } from '../../lib/i18n-core';

export default defineTool({
  slug: 'downloader',
  name: t('Video & audio downloader'),
  category: 'video',
  order: 3,
  meta: t('yt-dlp · aria2c'),
  added: '2026-10-19',
  beta: true,
  online: 'required',
  description:
    t('Download videos and music from YouTube, SoundCloud, Twitch, Reddit, TikTok and 1800+ other sites. Pick the quality or get just the sound as MP3; playlists and subtitles work too. It runs on your computer, so the site has to be started with start.bat.'),
  keywords: [
    'youtube downloader', 'yt-dlp', 'youtube-dl', 'aria2', 'download video', 'youtube to mp3', 'youtube to mp4', 'soundcloud', 'twitch', 'tiktok', 'reddit video',
    'playlist download', 'seal', 'save video', 'music download', 'subtitles', 'sponsorblock',
  ],
  queued: true,
  component: lazyTool(() => import('./downloader/Downloader')),
});
