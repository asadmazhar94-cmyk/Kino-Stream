export type ResolutionOption = 'original' | '1080p' | '720p' | '480p' | '360p';

export type SourceKind = 'torrent' | 'magnet' | 'mirror' | 'archive';

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  source: 'torrent' | 'embedded' | 'external' | 'archive';
  url?: string;
  vttContent?: string;
  fileIndex?: number;
  streamIndex?: number;
  format?: string;
}

export interface EmbeddedSubtitleInfo {
  streamIndex: number;
  language: string;
  title: string;
  codec: string;
}

export interface MediaProbeInfo {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  formatName: string;
  bitrate: number;
  embeddedSubtitles: EmbeddedSubtitleInfo[];
}

export interface TorrentFileItem {
  index: number;
  name: string;
  path: string;
  length: number;
  extension: string;
  category: 'video' | 'audio' | 'subtitle' | 'other';
  nativePlayable: boolean;
  progress: number;
}

export interface TorrentSummary {
  infoHash: string;
  name: string;
  magnetURI: string;
  totalSize: number;
  downloaded: number;
  uploaded: number;
  downloadSpeed: number;
  uploadSpeed: number;
  progress: number;
  numPeers: number;
  ready: boolean;
  files: TorrentFileItem[];
  subtitleTracks: SubtitleTrack[];
}

export interface MirrorLinkEntry {
  label: string;
  url: string;
  reachable?: boolean;
  contentLength?: number;
  contentType?: string;
}

export interface PlayableMediaItem {
  id: string;
  title: string;
  sourceKind: SourceKind;
  formatLabel: string;
  nativePlayable: boolean;
  fileSize?: number;
  duration?: number;
  nativeResolution?: string;
  // For torrent/magnet
  infoHash?: string;
  fileIndex?: number;
  magnetURI?: string;
  // For mirror/archive
  mirrors?: MirrorLinkEntry[];
  activeMirrorIndex?: number;
  // Subtitles
  subtitles: SubtitleTrack[];
  posterUrl?: string;
  description?: string;
}

export type IndexerKind = 'auto' | 'archive-org' | 'torznab-rss' | 'json-api' | 'html-links';

export interface TorrentIndexerSite {
  id: string;
  name: string;
  urlTemplate: string;
  kind: IndexerKind;
  apiKey?: string;
  enabled: boolean;
  isPreset?: boolean;
  addedAt: number;
}

export interface TorrentSearchResult {
  id: string;
  title: string;
  siteId: string;
  siteName: string;
  sizeBytes?: number;
  seeders?: number;
  leechers?: number;
  publishedAt?: string;
  magnetUri?: string;
  torrentUrl?: string;
  mirrorUrl?: string;
  infoUrl?: string;
  category?: string;
  archiveIdentifier?: string;
}

