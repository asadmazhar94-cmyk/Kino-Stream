import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import multer from 'multer';
import WebTorrent, { type Torrent, type TorrentFile } from 'webtorrent';
import { ARCHIVE_CATALOG, getArchiveSubtitleVtt } from './server/archiveCatalog.ts';
import {
  classifyFile,
  extractEmbeddedSubtitleVtt,
  probeMedia,
  spawnFfmpegStream,
} from './server/mediaUtils.ts';
import {
  convertToWebVtt,
  detectLanguageFromFilename,
  resolveLanguageLabel,
} from './server/subtitleUtils.ts';
import {
  resolveSearchResultPlayable,
  searchIndexerSite,
} from './server/indexerUtils.ts';
import type {
  MirrorLinkEntry,
  PlayableMediaItem,
  ResolutionOption,
  SubtitleTrack,
  TorrentFileItem,
  TorrentIndexerSite,
  TorrentSearchResult,
  TorrentSummary,
} from './src/types/media.ts';

const PORT = 3000;
const CACHE_DIR = '/tmp/kinostream-cache';
fs.mkdirSync(CACHE_DIR, { recursive: true });

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.fastcast.nz',
];

const torrentClient = new WebTorrent({
  maxConns: 55,
  dht: true,
  lsd: false,
});

torrentClient.on('error', (err) => {
  console.error('[WebTorrent Client Error]', err instanceof Error ? err.message : err);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function buildTorrentSummary(torrent: Torrent): TorrentSummary {
  const files: TorrentFileItem[] = (torrent.files || []).map((f, index) => {
    const info = classifyFile(f.name);
    return {
      index,
      name: f.name,
      path: f.path,
      length: f.length,
      extension: info.extension,
      category: info.category,
      nativePlayable: info.nativePlayable,
      progress: Number.isFinite(f.progress) ? f.progress : 0,
    };
  });

  const subtitleTracks: SubtitleTrack[] = files
    .filter((f) => f.category === 'subtitle')
    .map((f) => {
      const lang = detectLanguageFromFilename(f.name);
      return {
        id: `torrent-${torrent.infoHash}-${f.index}`,
        label: `${lang.label} (${f.name})`,
        language: lang.code,
        source: 'torrent' as const,
        fileIndex: f.index,
        format: f.extension.replace('.', ''),
        url: `/api/subtitles/torrent/${torrent.infoHash}/${f.index}`,
      };
    });

  return {
    infoHash: torrent.infoHash,
    name: torrent.name || 'Fetching metadata...',
    magnetURI: torrent.magnetURI,
    totalSize: torrent.length || files.reduce((acc, f) => acc + f.length, 0),
    downloaded: torrent.downloaded || 0,
    uploaded: torrent.uploaded || 0,
    downloadSpeed: torrent.downloadSpeed || 0,
    uploadSpeed: torrent.uploadSpeed || 0,
    progress: Number.isFinite(torrent.progress) ? torrent.progress : 0,
    numPeers: torrent.numPeers || 0,
    ready: Boolean(torrent.ready),
    files,
    subtitleTracks,
  };
}

function addTorrentAndAwaitMetadata(
  source: string | Buffer,
  timeoutMs = 20000,
): Promise<Torrent> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (torrent: Torrent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(torrent);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(
        new Error(
          'Timed out waiting for torrent peers or metadata. Ensure the torrent has active seeders or HTTP web seeds.',
        ),
      );
    }, timeoutMs);

    try {
      // Check if magnet already exists by btih hash
      if (typeof source === 'string' && source.startsWith('magnet:')) {
        const btihMatch = source.match(/xt=urn:btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
        if (btihMatch) {
          const existing = torrentClient.torrents.find(
            (t) => t.infoHash.toLowerCase() === btihMatch[1].toLowerCase(),
          );
          if (existing && existing.files && existing.files.length > 0) {
            finish(existing);
            return;
          }
        }
      }

      const torrent = torrentClient.add(source, {
        path: CACHE_DIR,
        announce: DEFAULT_TRACKERS,
      });

      torrent.on('error', (err) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      if (torrent.ready && torrent.files.length > 0) {
        finish(torrent);
        return;
      }

      torrent.once('metadata', () => {
        if (torrent.files.length > 0) {
          finish(torrent);
        }
      });

      torrent.once('ready', () => {
        finish(torrent);
      });
    } catch (err) {
      fail(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function findTorrentByHash(infoHash: string): Torrent | undefined {
  return torrentClient.torrents.find(
    (t) => t.infoHash.toLowerCase() === infoHash.toLowerCase(),
  );
}

function normalizeResolution(raw: unknown): ResolutionOption {
  const val = String(raw || 'original').toLowerCase();
  if (val === '1080p' || val === '720p' || val === '480p' || val === '360p') {
    return val;
  }
  return 'original';
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\\/\r\n<>|:*?]/g, '_').trim() || 'media';
}

function readTorrentFileText(file: TorrentFile): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, activeTorrents: torrentClient.torrents.length });
  });

  // Curated open-cinema catalog
  app.get('/api/archive/catalog', (_req: Request, res: Response) => {
    res.json({ items: ARCHIVE_CATALOG });
  });

  app.get('/api/archive/subtitles/:slug/:lang', (req: Request, res: Response) => {
    const vtt = getArchiveSubtitleVtt(String(req.params.slug), String(req.params.lang));
    if (!vtt) {
      res.status(404).send('Subtitle not found');
      return;
    }
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(vtt);
  });

  // List active torrents
  app.get('/api/torrents', (_req: Request, res: Response) => {
    const torrents = torrentClient.torrents.map(buildTorrentSummary);
    res.json({ torrents });
  });

  // Delete / stop active torrent
  app.delete('/api/torrents/:infoHash', (req: Request, res: Response) => {
    const infoHash = String(req.params.infoHash);
    const torrent = findTorrentByHash(infoHash);
    if (!torrent) {
      res.status(404).json({ error: 'Torrent not found' });
      return;
    }
    torrentClient.remove(torrent, { destroyStore: true }, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ removed: infoHash });
    });
  });

  // Inspect temporary stream cache disk usage
  app.get('/api/files/storage', (_req: Request, res: Response) => {
    let diskBytes = 0;
    let cachedEntries = 0;

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(full);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(full);
            diskBytes += stat.size;
            cachedEntries += 1;
          } catch {
            // ignore transient file locks
          }
        }
      }
    };

    walkDir(CACHE_DIR);

    res.json({
      cacheDir: CACHE_DIR,
      diskBytes,
      cachedEntries,
      activeTorrents: torrentClient.torrents.length,
    });
  });

  // Purge temporary stream cache (all torrents or only inactive cache files)
  app.delete('/api/files/cache', async (req: Request, res: Response) => {
    const scope = String(req.query.scope || 'all');

    if (scope === 'all') {
      const removals = torrentClient.torrents.map(
        (t) =>
          new Promise<void>((resolve) => {
            torrentClient.remove(t, { destroyStore: true }, () => resolve());
          }),
      );
      await Promise.all(removals);

      try {
        if (fs.existsSync(CACHE_DIR)) {
          fs.rmSync(CACHE_DIR, { recursive: true, force: true });
          fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
      } catch {
        // ignore if locked
      }
    }

    res.json({ cleared: true, scope });
  });

  // Load magnet link or remote .torrent URL
  app.post('/api/sources/magnet', async (req: Request, res: Response) => {
    const magnetUri = String(req.body?.magnetUri || '').trim();
    if (!magnetUri || (!magnetUri.startsWith('magnet:') && !magnetUri.startsWith('http'))) {
      res.status(400).json({ error: 'Please provide a valid magnet:? URI or .torrent URL.' });
      return;
    }

    try {
      const torrent = await addTorrentAndAwaitMetadata(magnetUri);
      res.json({ torrent: buildTorrentSummary(torrent) });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Unable to resolve magnet metadata',
      });
    }
  });

  // Upload .torrent file
  app.post('/api/sources/torrent', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Please upload a .torrent file.' });
      return;
    }

    try {
      const torrent = await addTorrentAndAwaitMetadata(req.file.buffer);
      res.json({ torrent: buildTorrentSummary(torrent) });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Invalid or unreachable torrent file',
      });
    }
  });

  // Validate and inspect HTTP/HTTPS mirror links
  app.post('/api/sources/mirror', async (req: Request, res: Response) => {
    const rawUrl = String(req.body?.url || '').trim();
    const rawFallbacks: string[] = Array.isArray(req.body?.fallbackUrls)
      ? req.body.fallbackUrls.map((u: unknown) => String(u).trim()).filter(Boolean)
      : [];
    const customTitle = String(req.body?.title || '').trim();

    if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
      res.status(400).json({ error: 'Mirror link must be a valid http:// or https:// URL.' });
      return;
    }

    const allUrls = [rawUrl, ...rawFallbacks.filter((u) => u !== rawUrl)];
    const mirrors: MirrorLinkEntry[] = [];

    for (let i = 0; i < allUrls.length; i += 1) {
      const url = allUrls[i];
      try {
        const headResp = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        const contentLength = Number(headResp.headers.get('content-length') || 0);
        const contentType = headResp.headers.get('content-type') || '';
        mirrors.push({
          label: i === 0 ? 'Primary Mirror' : `Fallback Mirror ${i}`,
          url,
          reachable: headResp.ok,
          contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
          contentType,
        });
      } catch {
        mirrors.push({
          label: i === 0 ? 'Primary Mirror' : `Fallback Mirror ${i}`,
          url,
          reachable: false,
        });
      }
    }

    const activeMirror = mirrors.find((m) => m.reachable) || mirrors[0];
    const activeIndex = Math.max(0, mirrors.indexOf(activeMirror));
    const urlPath = new URL(activeMirror.url).pathname;
    const inferredFilename = decodeURIComponent(path.basename(urlPath) || 'stream.mp4');
    const fileClass = classifyFile(inferredFilename);

    // Probe with ffprobe for exact duration, resolution, codecs, and embedded subtitles
    const probe = await probeMedia(activeMirror.url);

    const subtitles: SubtitleTrack[] = (probe?.embeddedSubtitles || []).map((sub) => ({
      id: `emb-${Date.now()}-${sub.streamIndex}`,
      label: `${sub.title} (Embedded)`,
      language: sub.language,
      source: 'embedded' as const,
      streamIndex: sub.streamIndex,
      url: `/api/subtitles/embedded?url=${encodeURIComponent(activeMirror.url)}&index=${sub.streamIndex}`,
    }));

    const nativeResolution =
      probe && probe.height > 0 ? `${probe.height}p` : undefined;
    const formatBadge = probe?.videoCodec
      ? `${fileClass.extension.replace('.', '').toUpperCase() || 'MEDIA'} · ${probe.videoCodec.toUpperCase()}`
      : fileClass.extension.replace('.', '').toUpperCase() || 'STREAM';

    const item: PlayableMediaItem = {
      id: `mirror-${Date.now()}`,
      title: customTitle || inferredFilename,
      sourceKind: 'mirror',
      formatLabel: formatBadge,
      nativePlayable: fileClass.nativePlayable || (activeMirror.contentType || '').includes('mp4') || (activeMirror.contentType || '').includes('webm'),
      fileSize: activeMirror.contentLength,
      duration: probe?.duration || undefined,
      nativeResolution,
      mirrors,
      activeMirrorIndex: activeIndex,
      subtitles,
    };

    res.json({ item, probe });
  });

  // Probe torrent file metadata (resolution, duration, embedded subtitles)
  app.get('/api/probe/torrent/:infoHash/:fileIndex', async (req: Request, res: Response) => {
    const infoHash = String(req.params.infoHash);
    const fileIndex = Number(req.params.fileIndex);
    const torrent = findTorrentByHash(infoHash);
    if (!torrent || !torrent.files[fileIndex]) {
      res.status(404).json({ error: 'Torrent file not found' });
      return;
    }

    const file = torrent.files[fileIndex];
    const localUrl = `http://127.0.0.1:${PORT}/api/stream/torrent/${infoHash}/${fileIndex}?resolution=original`;
    const probe = await probeMedia(localUrl);
    const fileClass = classifyFile(file.name);

    const embeddedSubtitles: SubtitleTrack[] = (probe?.embeddedSubtitles || []).map((sub) => ({
      id: `emb-${infoHash}-${fileIndex}-${sub.streamIndex}`,
      label: `${sub.title} (Embedded)`,
      language: sub.language,
      source: 'embedded' as const,
      streamIndex: sub.streamIndex,
      url: `/api/subtitles/embedded?infoHash=${encodeURIComponent(infoHash)}&fileIndex=${fileIndex}&index=${sub.streamIndex}`,
    }));

    res.json({
      probe,
      nativePlayable: fileClass.nativePlayable,
      embeddedSubtitles,
    });
  });

  // Stream torrent file (HTTP 206 Byte-Range OR ffmpeg resolution/format transcode)
  app.get('/api/stream/torrent/:infoHash/:fileIndex', (req: Request, res: Response) => {
    const infoHash = String(req.params.infoHash);
    const fileIndex = Number(req.params.fileIndex);
    const resolution = normalizeResolution(req.query.resolution);
    const startTime = Math.max(0, Number(req.query.t || 0));

    const torrent = findTorrentByHash(infoHash);
    if (!torrent || !torrent.files[fileIndex]) {
      res.status(404).send('Torrent file not found');
      return;
    }

    const file = torrent.files[fileIndex];
    const info = classifyFile(file.name);
    const needsTranscode = resolution !== 'original' || !info.nativePlayable;

    if (!needsTranscode) {
      const total = file.length;
      const rangeHeader = req.headers.range;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', info.mimeType);

      if (rangeHeader) {
        const match = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(match[0], 10);
        const end = match[1] ? Math.min(parseInt(match[1], 10), total - 1) : total - 1;

        if (Number.isNaN(start) || start >= total || end < start) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }

        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', chunkSize);

        const stream = file.createReadStream({ start, end });
        res.on('close', () => {
          stream.destroy();
        });
        stream.on('error', () => {
          if (!res.headersSent) res.status(500).end();
        });
        stream.pipe(res);
      } else {
        res.status(200);
        res.setHeader('Content-Length', total);
        const stream = file.createReadStream();
        res.on('close', () => {
          stream.destroy();
        });
        stream.pipe(res);
      }
      return;
    }

    // Transcode / rescale via ffmpeg reading from local HTTP byte-range endpoint
    // Using internal loopback URL allows ffmpeg to seek instantly with -ss!
    const internalUrl = `http://127.0.0.1:${PORT}/api/stream/torrent/${infoHash}/${fileIndex}?resolution=original`;
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');

    const { proc, outputStream } = spawnFfmpegStream({
      inputUrlOrPipe: internalUrl,
      resolution,
      startTimeSeconds: startTime,
      isDownload: false,
    });

    outputStream.pipe(res);

    res.on('close', () => {
      proc.kill('SIGKILL');
    });
    proc.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
  });

  // Offline download of torrent file in selected resolution
  app.get('/api/download/torrent/:infoHash/:fileIndex', (req: Request, res: Response) => {
    const infoHash = String(req.params.infoHash);
    const fileIndex = Number(req.params.fileIndex);
    const resolution = normalizeResolution(req.query.resolution);

    const torrent = findTorrentByHash(infoHash);
    if (!torrent || !torrent.files[fileIndex]) {
      res.status(404).send('Torrent file not found');
      return;
    }

    const file = torrent.files[fileIndex];
    const info = classifyFile(file.name);
    const baseName = sanitizeFilename(path.parse(file.name).name);

    if (resolution === 'original') {
      const downloadName = sanitizeFilename(file.name);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', info.mimeType);
      res.setHeader('Content-Length', file.length);
      const stream = file.createReadStream();
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }

    const downloadName = `${baseName}_${resolution}.mp4`;
    const internalUrl = `http://127.0.0.1:${PORT}/api/stream/torrent/${infoHash}/${fileIndex}?resolution=original`;

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const { proc, outputStream } = spawnFfmpegStream({
      inputUrlOrPipe: internalUrl,
      resolution,
      isDownload: true,
    });

    outputStream.pipe(res);
    res.on('close', () => proc.kill('SIGKILL'));
  });

  // Stream mirror link (HTTP 206 range proxy OR ffmpeg resolution/format transcode)
  app.get('/api/stream/mirror', async (req: Request, res: Response) => {
    const mirrorUrl = String(req.query.url || '').trim();
    const resolution = normalizeResolution(req.query.resolution);
    const startTime = Math.max(0, Number(req.query.t || 0));

    if (!mirrorUrl || (!mirrorUrl.startsWith('http://') && !mirrorUrl.startsWith('https://'))) {
      res.status(400).send('Invalid mirror URL');
      return;
    }

    const urlPath = new URL(mirrorUrl).pathname;
    const info = classifyFile(urlPath);
    const forceTranscode = req.query.transcode === '1' || resolution !== 'original' || (info.extension !== '' && !info.nativePlayable && info.category === 'video');

    if (!forceTranscode) {
      try {
        const headers: Record<string, string> = {};
        if (req.headers.range) {
          headers.Range = req.headers.range;
        }
        const upstream = await fetch(mirrorUrl, {
          headers,
          redirect: 'follow',
        });

        if (!upstream.ok && upstream.status !== 206) {
          res.status(upstream.status).send('Upstream mirror returned an error');
          return;
        }

        res.status(upstream.status);
        const forwardHeaders = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
        ];
        for (const key of forwardHeaders) {
          const val = upstream.headers.get(key);
          if (val) res.setHeader(key, val);
        }
        if (!upstream.headers.get('accept-ranges')) {
          res.setHeader('Accept-Ranges', 'bytes');
        }

        if (upstream.body) {
          const nodeStream = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream);
          res.on('close', () => nodeStream.destroy());
          nodeStream.pipe(res);
        } else {
          res.end();
        }
      } catch (err) {
        res.status(502).send(err instanceof Error ? err.message : 'Mirror fetch failed');
      }
      return;
    }

    // Transcode / resize mirror link via ffmpeg
    res.status(200);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');

    const { proc, outputStream } = spawnFfmpegStream({
      inputUrlOrPipe: mirrorUrl,
      resolution,
      startTimeSeconds: startTime,
      isDownload: false,
    });

    outputStream.pipe(res);
    res.on('close', () => proc.kill('SIGKILL'));
  });

  // Offline download of mirror link in selected resolution
  app.get('/api/download/mirror', async (req: Request, res: Response) => {
    const mirrorUrl = String(req.query.url || '').trim();
    const resolution = normalizeResolution(req.query.resolution);
    const requestedName = String(req.query.filename || '').trim();

    if (!mirrorUrl || (!mirrorUrl.startsWith('http://') && !mirrorUrl.startsWith('https://'))) {
      res.status(400).send('Invalid mirror URL');
      return;
    }

    const urlBase = decodeURIComponent(path.basename(new URL(mirrorUrl).pathname) || 'video.mp4');
    const cleanBase = sanitizeFilename(path.parse(requestedName || urlBase).name);

    if (resolution === 'original') {
      try {
        const upstream = await fetch(mirrorUrl, { redirect: 'follow' });
        if (!upstream.ok || !upstream.body) {
          res.status(502).send('Failed to fetch mirror for offline download');
          return;
        }
        const ext = path.extname(urlBase) || '.mp4';
        res.setHeader('Content-Disposition', `attachment; filename="${cleanBase}${ext}"`);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
        const len = upstream.headers.get('content-length');
        if (len) res.setHeader('Content-Length', len);

        const nodeStream = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream);
        res.on('close', () => nodeStream.destroy());
        nodeStream.pipe(res);
      } catch (err) {
        res.status(502).send(err instanceof Error ? err.message : 'Download failed');
      }
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${cleanBase}_${resolution}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    const { proc, outputStream } = spawnFfmpegStream({
      inputUrlOrPipe: mirrorUrl,
      resolution,
      isDownload: true,
    });

    outputStream.pipe(res);
    res.on('close', () => proc.kill('SIGKILL'));
  });

  // Extract sidecar subtitle from torrent and convert to UTF-8 WebVTT
  app.get('/api/subtitles/torrent/:infoHash/:fileIndex', async (req: Request, res: Response) => {
    const infoHash = String(req.params.infoHash);
    const fileIndex = Number(req.params.fileIndex);
    const torrent = findTorrentByHash(infoHash);
    if (!torrent || !torrent.files[fileIndex]) {
      res.status(404).send('Subtitle file not found');
      return;
    }

    try {
      const file = torrent.files[fileIndex];
      const rawText = await readTorrentFileText(file);
      const vtt = convertToWebVtt(rawText, file.name);
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.send(vtt);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : 'Failed to parse torrent subtitle');
    }
  });

  // Extract embedded subtitle track from MKV/MP4 container via ffmpeg
  app.get('/api/subtitles/embedded', async (req: Request, res: Response) => {
    const streamIndex = Math.max(0, Number(req.query.index || 0));
    const infoHash = String(req.query.infoHash || '');
    const fileIndex = Number(req.query.fileIndex || 0);
    const mirrorUrl = String(req.query.url || '');

    let source = mirrorUrl;
    if (infoHash) {
      source = `http://127.0.0.1:${PORT}/api/stream/torrent/${infoHash}/${fileIndex}?resolution=original`;
    }

    if (!source) {
      res.status(400).send('Missing source for embedded subtitle extraction');
      return;
    }

    try {
      const vtt = await extractEmbeddedSubtitleVtt(source, streamIndex);
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.send(vtt);
    } catch (err) {
      res.status(500).send(err instanceof Error ? err.message : 'Failed to extract embedded subtitle');
    }
  });

  // Upload or fetch an international subtitle file (.srt, .vtt, .ass, .ssa, .sub) and convert to WebVTT
  app.post('/api/subtitles/convert', upload.single('file'), async (req: Request, res: Response) => {
    try {
      let rawText = '';
      let filename = String(req.body?.filename || 'subtitle.srt');

      if (req.file && req.file.buffer) {
        rawText = req.file.buffer.toString('utf8');
        filename = req.file.originalname || filename;
      } else if (req.body?.url) {
        const subUrl = String(req.body.url).trim();
        const resp = await fetch(subUrl, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
          res.status(422).json({ error: 'Failed to fetch remote subtitle URL.' });
          return;
        }
        rawText = await resp.text();
        filename = path.basename(new URL(subUrl).pathname) || filename;
      } else if (req.body?.content) {
        rawText = String(req.body.content);
      } else {
        res.status(400).json({ error: 'Provide a subtitle file, URL, or text content.' });
        return;
      }

      const detected = detectLanguageFromFilename(filename);
      const langInfo = req.body?.language
        ? resolveLanguageLabel(String(req.body.language))
        : detected;
      const vttContent = convertToWebVtt(rawText, filename);

      res.json({
        id: `ext-${Date.now()}`,
        language: langInfo.code,
        label: String(req.body?.label || langInfo.label || filename),
        vttContent,
      });
    } catch (err) {
      res.status(422).json({
        error: err instanceof Error ? err.message : 'Failed to process subtitle file',
      });
    }
  });

  // Search across configured torrent sites / indexers
  app.post('/api/indexers/search', async (req: Request, res: Response) => {
    const query = String(req.body?.query || '').trim();
    const sites: TorrentIndexerSite[] = Array.isArray(req.body?.sites) ? req.body.sites : [];

    if (!query) {
      res.status(400).json({ error: 'Enter a search query.' });
      return;
    }

    const enabledSites = sites.filter((s) => s.enabled && s.urlTemplate);
    if (enabledSites.length === 0) {
      res.status(400).json({ error: 'Enable or add at least one torrent site to search.' });
      return;
    }

    const perSite = await Promise.all(
      enabledSites.map(async (site) => {
        const outcome = await searchIndexerSite(site, query);
        return {
          siteId: site.id,
          siteName: site.name,
          detectedKind: outcome.detectedKind,
          count: outcome.results.length,
          error: outcome.error,
          results: outcome.results,
        };
      }),
    );

    const results = perSite.flatMap((s) => s.results);
    const siteStatuses = perSite.map(({ results: _r, ...status }) => status);

    res.json({ results, siteStatuses });
  });

  // Test connectivity and parser output for a custom torrent site
  app.post('/api/indexers/test', async (req: Request, res: Response) => {
    const site = req.body?.site as TorrentIndexerSite | undefined;
    const query = String(req.body?.query || 'sintel').trim();
    if (!site || !site.urlTemplate) {
      res.status(400).json({ error: 'Provide a valid torrent site URL template.' });
      return;
    }

    const outcome = await searchIndexerSite(site, query);
    res.json({
      ok: !outcome.error,
      count: outcome.results.length,
      detectedKind: outcome.detectedKind,
      sampleTitles: outcome.results.slice(0, 3).map((r) => r.title),
      error: outcome.error,
    });
  });

  // Resolve a search result (e.g., Archive.org item or HTML detail page) to magnet/torrent/mirror
  app.post('/api/indexers/resolve', async (req: Request, res: Response) => {
    const result = req.body?.result as TorrentSearchResult | undefined;
    if (!result) {
      res.status(400).json({ error: 'Missing search result payload.' });
      return;
    }

    const resolved = await resolveSearchResultPlayable(result);
    res.json(resolved);
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KinoStream server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
