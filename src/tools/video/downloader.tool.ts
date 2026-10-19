import { defineTool, lazyTool } from '../../registry/types';

export default defineTool({
  slug: 'downloader',
  name: 'Video & audio downloader',
  category: 'video',
  order: 3,
  meta: 'yt-dlp · aria2c',
  added: '2026-10-19',
  beta: true,
  online: 'required',
  description:
    'Download videos and music from YouTube, SoundCloud, Twitch, Reddit, TikTok and 1800+ sites, like the Seal app: pick the quality or get just the sound as MP3 with its cover, whole playlists, subtitles, cut-out sponsors. Uses yt-dlp and aria2c (16 connections at once) on your computer, so it needs the site started with start.bat.',
  keywords: [
    'youtube downloader', 'yt-dlp', 'youtube-dl', 'aria2', 'download video', 'youtube to mp3', 'youtube to mp4', 'soundcloud', 'twitch', 'tiktok', 'reddit video',
    'playlist download', 'seal', 'save video', 'music download', 'subtitles', 'sponsorblock',
  ],
  component: lazyTool(() => import('./downloader/Downloader')),
});
