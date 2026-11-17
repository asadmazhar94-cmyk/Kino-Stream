import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileUp, Globe, Link2, Magnet, X } from 'lucide-react';
import { AddSourceModal } from './components/AddSourceModal.tsx';
import { CinemaPlayer } from './components/CinemaPlayer.tsx';
import { FileManagerPanel } from './components/FileManagerPanel.tsx';
import { OpenArchiveSection } from './components/OpenArchiveSection.tsx';
import { SubtitleStudioPanel } from './components/SubtitleStudioPanel.tsx';
import { TopBar, type ActiveView } from './components/TopBar.tsx';
import { TorrentSearchPanel } from './components/TorrentSearchPanel.tsx';
import type {
  PlayableMediaItem,
  ResolutionOption,
  SubtitleTrack,
  TorrentIndexerSite,
  TorrentSearchResult,
  TorrentSummary,
} from './types/media.ts';
import {
  deletePermanentFile,
  getBrowserStorageQuota,
  getPermanentFileBlob,
  listPermanentFiles,
  savePermanentFileRecord,
  triggerBlobDownload,
  type PermanentFileRecord,
} from './utils/offlineVault.ts';

const INDEXER_STORAGE_KEY = 'kinostream_indexer_sites_v1';

const DEFAULT_INDEXER_SITES: TorrentIndexerSite[] = [
  {
    id: 'preset-archive-movies',
    name: 'Internet Archive (Movies)',
    urlTemplate:
      'https://archive.org/advancedsearch.php?q={query}+AND+mediatype:movies&fl[]=identifier,title,item_size,downloads,publicdate,mediatype&rows=25&output=json',
    kind: 'archive-org',
    enabled: true,
    isPreset: true,
    addedAt: 1,
  },
];

function loadInitialSites(): TorrentIndexerSite[] {
  try {
    const raw = localStorage.getItem(INDEXER_STORAGE_KEY);
    if (!raw) return DEFAULT_INDEXER_SITES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_INDEXER_SITES;
  } catch {
    return DEFAULT_INDEXER_SITES;
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('theater');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [indexerSites, setIndexerSites] = useState<TorrentIndexerSite[]>(loadInitialSites);
  const [archiveItems, setArchiveItems] = useState<PlayableMediaItem[]>([]);
  const [torrents, setTorrents] = useState<TorrentSummary[]>([]);
  const [permanentFiles, setPermanentFiles] = useState<PermanentFileRecord[]>([]);
  const [tempDiskBytes, setTempDiskBytes] = useState(0);
  const [tempCachedEntries, setTempCachedEntries] = useState(0);
  const [browserQuota, setBrowserQuota] = useState<{ usage: number; quota: number } | null>(null);

  const [currentMedia, setCurrentMedia] = useState<PlayableMediaItem | null>(null);
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionOption>('original');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);

  const [vaultSavingProgress, setVaultSavingProgress] = useState<number | null>(null);
  const [loadingMagnetId, setLoadingMagnetId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(INDEXER_STORAGE_KEY, JSON.stringify(indexerSites));
    } catch {
      // ignore storage quota errors
    }
  }, [indexerSites]);

  const refreshPermanentStorage = useCallback(async () => {
    const [records, quota] = await Promise.all([
      listPermanentFiles(),
      getBrowserStorageQuota(),
    ]);
    setPermanentFiles(records);
    setBrowserQuota(quota);
  }, []);

  const refreshTorrentsAndStorage = useCallback(async () => {
    try {
      const [torrentsResp, storageResp] = await Promise.all([
        fetch('/api/torrents'),
        fetch('/api/files/storage'),
      ]);
      if (torrentsResp.ok) {
        const data = await torrentsResp.json();
        setTorrents(data.torrents || []);
      }
      if (storageResp.ok) {
        const s = await storageResp.json();
        setTempDiskBytes(s.diskBytes || 0);
        setTempCachedEntries(s.cachedEntries || 0);
      }
    } catch {
      // ignore background poll failures
    }
  }, []);

  useEffect(() => {
    fetch('/api/archive/catalog')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items)) setArchiveItems(data.items);
      })
      .catch(() => {});

    refreshTorrentsAndStorage();
    refreshPermanentStorage();
  }, [refreshTorrentsAndStorage, refreshPermanentStorage]);

  useEffect(() => {
    const intervalMs = torrents.length > 0 ? 2500 : 10000;
    const id = window.setInterval(refreshTorrentsAndStorage, intervalMs);
    return () => window.clearInterval(id);
  }, [torrents.length, refreshTorrentsAndStorage]);

  useEffect(() => {
    return () => {
      if (offlineBlobUrl) URL.revokeObjectURL(offlineBlobUrl);
    };
  }, [offlineBlobUrl]);

  const clearOfflineBlob = () => {
    if (offlineBlobUrl) {
      URL.revokeObjectURL(offlineBlobUrl);
      setOfflineBlobUrl(null);
    }
  };

  const playTorrentFile = useCallback(
    async (torrent: TorrentSummary, fileIndex: number) => {
      const file = torrent.files[fileIndex];
      if (!file) return;

      clearOfflineBlob();
      const baseItem: PlayableMediaItem = {
        id: `torrent-${torrent.infoHash}-${file.index}`,
        title: file.name,
        sourceKind: 'torrent',
        formatLabel: file.extension.replace('.', '').toUpperCase() || 'MEDIA',
        nativePlayable: file.nativePlayable,
        fileSize: file.length,
        infoHash: torrent.infoHash,
        fileIndex: file.index,
        magnetURI: torrent.magnetURI,
        subtitles: [...torrent.subtitleTracks],
      };

      setCurrentMedia(baseItem);
      setResolution(file.nativePlayable ? 'original' : '720p');
      setActiveSubtitleId(torrent.subtitleTracks[0]?.id || null);
      setSubtitleOffset(0);
      setActiveView('theater');

      // Probe torrent file for duration, resolution, and embedded MKV/MP4 subtitles
      try {
        const resp = await fetch(`/api/probe/torrent/${torrent.infoHash}/${fileIndex}`);
        if (resp.ok) {
          const data = await resp.json();
          setCurrentMedia((prev) => {
            if (!prev || prev.id !== baseItem.id) return prev;
            const mergedSubs = [...prev.subtitles, ...(data.embeddedSubtitles || [])];
            return {
              ...prev,
              duration: data.probe?.duration || prev.duration,
              nativeResolution: data.probe?.height ? `${data.probe.height}p` : prev.nativeResolution,
              formatLabel: data.probe?.videoCodec
                ? `${file.extension.replace('.', '').toUpperCase()} · ${String(data.probe.videoCodec).toUpperCase()}`
                : prev.formatLabel,
              subtitles: mergedSubs,
            };
          });
        }
      } catch {
        // non-blocking probe
      }
    },
    [offlineBlobUrl],
  );

  const handleTorrentLoaded = (torrent: TorrentSummary) => {
    refreshTorrentsAndStorage();
    const playable = torrent.files.find((f) => f.category === 'video') ||
      torrent.files.find((f) => f.category === 'audio');
    if (playable) {
      playTorrentFile(torrent, playable.index);
      setNotice({ kind: 'info', text: `Streaming "${playable.name}" from ${torrent.name}.` });
    } else {
      setActiveView('files');
      setNotice({ kind: 'info', text: `Loaded torrent "${torrent.name}" (${torrent.files.length} files).` });
    }
  };

  const handleMirrorLoaded = (item: PlayableMediaItem) => {
    clearOfflineBlob();
    setCurrentMedia(item);
    setResolution(item.nativePlayable ? 'original' : '720p');
    setActiveSubtitleId(item.subtitles[0]?.id || null);
    setSubtitleOffset(0);
    setActiveView('theater');
    setNotice({ kind: 'info', text: `Loaded mirror stream "${item.title}".` });
  };

  const handleStreamArchiveMagnet = async (magnetUri: string) => {
    const matched = archiveItems.find((a) => a.magnetURI === magnetUri);
    setLoadingMagnetId(matched?.id || 'magnet');
    try {
      const resp = await fetch('/api/sources/magnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetUri }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to connect magnet peers');
      handleTorrentLoaded(data.torrent);
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to resolve magnet link',
      });
    } finally {
      setLoadingMagnetId(null);
    }
  };

  const handleQuickLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = quickInput.trim();
    if (!input) return;
    setQuickLoading(true);
    setNotice(null);
    try {
      if (input.startsWith('magnet:') || input.endsWith('.torrent')) {
        const resp = await fetch('/api/sources/magnet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnetUri: input }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to load magnet');
        handleTorrentLoaded(data.torrent);
      } else {
        const resp = await fetch('/api/sources/mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to load mirror URL');
        handleMirrorLoaded(data.item);
      }
      setQuickInput('');
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to load source',
      });
    } finally {
      setQuickLoading(false);
    }
  };

  const buildDownloadUrl = (item: PlayableMediaItem, targetRes: ResolutionOption): string => {
    if (item.sourceKind === 'torrent' || item.sourceKind === 'magnet') {
      return `/api/download/torrent/${encodeURIComponent(item.infoHash!)}/${item.fileIndex}?resolution=${targetRes}`;
    }
    const activeMirror =
      item.mirrors?.[item.activeMirrorIndex ?? 0] || item.mirrors?.[0];
    const params = new URLSearchParams({
      url: activeMirror?.url || '',
      resolution: targetRes,
      filename: item.title,
    });
    return `/api/download/mirror?${params.toString()}`;
  };

  const buildDownloadFilename = (title: string, targetRes: ResolutionOption): string => {
    const base = title.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9._-]+/gi, '_');
    return targetRes === 'original' ? title : `${base}_${targetRes}.mp4`;
  };

  const handleSaveToDevice = async (item: PlayableMediaItem, targetRes: ResolutionOption) => {
    const url = buildDownloadUrl(item, targetRes);
    const filename = buildDownloadFilename(item.title, targetRes);
    triggerBlobDownload(url, filename);

    await savePermanentFileRecord({
      id: `dev-${Date.now()}`,
      title: item.title,
      filename,
      resolution: targetRes,
      formatLabel: targetRes === 'original' ? item.formatLabel : 'MP4 · H.264',
      sizeBytes: item.fileSize || 0,
      createdAt: Date.now(),
      storageMode: 'device-log',
      mimeType: 'video/mp4',
      sourceKind: item.sourceKind,
      hasBlob: false,
    });
    await refreshPermanentStorage();
    setNotice({
      kind: 'info',
      text: `Started device download for "${filename}" (${targetRes}).`,
    });
  };

  const handleSaveToOfflineVault = async (
    item: PlayableMediaItem,
    targetRes: ResolutionOption,
  ) => {
    const url = buildDownloadUrl(item, targetRes);
    const filename = buildDownloadFilename(item.title, targetRes);
    setVaultSavingProgress(0);
    setNotice(null);

    try {
      const resp = await fetch(url);
      if (!resp.ok || !resp.body) {
        throw new Error('Failed to fetch media for offline caching');
      }
      const contentLength = Number(resp.headers.get('content-length') || item.fileSize || 0);
      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          if (contentLength > 0) {
            setVaultSavingProgress(Math.min(99, (received / contentLength) * 100));
          } else {
            setVaultSavingProgress((prev) => Math.min(95, (prev || 0) + 4));
          }
        }
      }

      const blobParts = chunks.map((c) => c.slice().buffer);
      const blob = new Blob(blobParts, {
        type: resp.headers.get('content-type') || 'video/mp4',
      });

      await savePermanentFileRecord(
        {
          id: `vault-${Date.now()}`,
          title: item.title,
          filename,
          resolution: targetRes,
          formatLabel: targetRes === 'original' ? item.formatLabel : 'MP4 · H.264',
          sizeBytes: blob.size,
          createdAt: Date.now(),
          storageMode: 'vault',
          mimeType: blob.type,
          sourceKind: item.sourceKind,
          subtitles: item.subtitles,
          hasBlob: true,
        },
        blob,
      );

      await refreshPermanentStorage();
      setNotice({
        kind: 'info',
        text: `Saved "${filename}" (${targetRes}) permanently to Offline Vault.`,
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Offline vault save failed',
      });
    } finally {
      setVaultSavingProgress(null);
    }
  };

  const handlePlayPermanentFile = async (record: PermanentFileRecord) => {
    const blob = await getPermanentFileBlob(record.id);
    if (!blob) {
      setNotice({ kind: 'error', text: 'Offline file blob not found in browser storage.' });
      return;
    }
    clearOfflineBlob();
    const url = URL.createObjectURL(blob);
    setOfflineBlobUrl(url);
    setCurrentMedia({
      id: record.id,
      title: record.title,
      sourceKind: 'mirror',
      formatLabel: record.formatLabel,
      nativePlayable: true,
      fileSize: record.sizeBytes,
      nativeResolution: record.resolution,
      subtitles: record.subtitles || [],
    });
    setResolution('original');
    setActiveSubtitleId(record.subtitles?.[0]?.id || null);
    setActiveView('theater');
  };

  const handleExportPermanentFile = async (record: PermanentFileRecord) => {
    const blob = await getPermanentFileBlob(record.id);
    if (!blob) return;
    triggerBlobDownload(blob, record.filename);
  };

  const handleUploadSubtitleFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch('/api/subtitles/convert', {
      method: 'POST',
      body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) {
      setNotice({ kind: 'error', text: data.error || 'Subtitle conversion failed' });
      return;
    }
    const track: SubtitleTrack = {
      id: data.id,
      label: data.label,
      language: data.language,
      source: 'external',
      vttContent: data.vttContent,
    };
    setCurrentMedia((prev) =>
      prev ? { ...prev, subtitles: [...prev.subtitles, track] } : prev,
    );
    setActiveSubtitleId(track.id);
    setNotice({ kind: 'info', text: `Loaded subtitle track "${track.label}".` });
  };

  const handleSearchResultAction = async (
    result: TorrentSearchResult,
    mode: 'stream' | 'queue',
  ) => {
    setNotice(null);
    try {
      const resolveResp = await fetch('/api/indexers/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      const resolved = await resolveResp.json();
      const torrentSource = resolved.magnetUri || resolved.torrentUrl || result.magnetUri || result.torrentUrl;
      const mirrorFallback = resolved.mirrorUrl || result.mirrorUrl;

      if (torrentSource) {
        const resp = await fetch('/api/sources/magnet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ magnetUri: torrentSource }),
        });
        const data = await resp.json();
        if (resp.ok && data.torrent) {
          if (mode === 'stream') {
            handleTorrentLoaded(data.torrent);
          } else {
            await refreshTorrentsAndStorage();
            setNotice({
              kind: 'info',
              text: `Queued "${data.torrent.name}" in File Management.`,
            });
          }
          return;
        }
        if (!mirrorFallback) {
          throw new Error(data.error || 'Failed to load torrent from search result');
        }
      }

      if (mirrorFallback && mode === 'stream') {
        const mResp = await fetch('/api/sources/mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: mirrorFallback, title: result.title }),
        });
        const mData = await mResp.json();
        if (!mResp.ok) throw new Error(mData.error || 'Failed to stream fallback mirror');
        handleMirrorLoaded(mData.item);
        return;
      }

      throw new Error('No playable magnet, .torrent, or mirror URL found for this item.');
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to load selected torrent result',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F1F5F9]">
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      <main className="mx-auto max-w-[1440px] px-6 py-6 space-y-10">
        {notice && (
          <div
            className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-xs ${
              notice.kind === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
              <span>{notice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Theater View */}
        {activeView === 'theater' && (
          <>
            <CinemaPlayer
              media={currentMedia}
              offlineBlobUrl={offlineBlobUrl}
              resolution={resolution}
              onResolutionChange={setResolution}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
              activeSubtitleId={activeSubtitleId}
              onSelectSubtitleId={setActiveSubtitleId}
              subtitleOffset={subtitleOffset}
              onSubtitleOffsetChange={setSubtitleOffset}
              onSwitchMirror={(idx) => {
                setCurrentMedia((prev) =>
                  prev ? { ...prev, activeMirrorIndex: idx } : prev,
                );
              }}
              onUploadSubtitleFile={handleUploadSubtitleFile}
              onSaveToDevice={handleSaveToDevice}
              onSaveToOfflineVault={handleSaveToOfflineVault}
              vaultSavingProgress={vaultSavingProgress}
              onOpenLoadModal={() => setIsAddModalOpen(true)}
              onPlayFeatured={() => {
                if (archiveItems[0]) handleMirrorLoaded(archiveItems[0]);
              }}
            />

            {/* Quick Magnet / Mirror Input Bar */}
            <section className="rounded-xl border border-white/10 bg-[#12151C] p-4">
              <form onSubmit={handleQuickLoad} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder="Paste a magnet:? link, .torrent URL, or direct mirror stream URL (MP4, MKV, WebM, AVI, FLAC)..."
                    className="w-full rounded-lg border border-white/10 bg-[#0B0D11] pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={quickLoading || !quickInput.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-45 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Magnet className="h-3.5 w-3.5" />
                    {quickLoading ? 'Connecting...' : 'Stream Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#181C25] hover:bg-white/10 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FileUp className="h-3.5 w-3.5 text-amber-400" />
                    Upload .torrent
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('search')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#181C25] hover:bg-white/10 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Globe className="h-3.5 w-3.5 text-amber-400" />
                    Search Sites
                  </button>
                </div>
              </form>
            </section>

            {/* File Management System */}
            <FileManagerPanel
              torrents={torrents}
              permanentFiles={permanentFiles}
              tempDiskBytes={tempDiskBytes}
              tempCachedEntries={tempCachedEntries}
              browserQuota={browserQuota}
              selectedResolution={resolution}
              onPlayTorrentFile={playTorrentFile}
              onSaveTorrentFileOffline={(torrent, fileIdx, res) => {
                const file = torrent.files[fileIdx];
                if (!file) return;
                handleSaveToOfflineVault(
                  {
                    id: `torrent-${torrent.infoHash}-${file.index}`,
                    title: file.name,
                    sourceKind: 'torrent',
                    formatLabel: file.extension.replace('.', '').toUpperCase() || 'MEDIA',
                    nativePlayable: file.nativePlayable,
                    fileSize: file.length,
                    infoHash: torrent.infoHash,
                    fileIndex: file.index,
                    subtitles: torrent.subtitleTracks,
                  },
                  res,
                );
              }}
              onDownloadTorrentFileToDevice={(torrent, fileIdx, res) => {
                const file = torrent.files[fileIdx];
                if (!file) return;
                handleSaveToDevice(
                  {
                    id: `torrent-${torrent.infoHash}-${file.index}`,
                    title: file.name,
                    sourceKind: 'torrent',
                    formatLabel: file.extension.replace('.', '').toUpperCase() || 'MEDIA',
                    nativePlayable: file.nativePlayable,
                    fileSize: file.length,
                    infoHash: torrent.infoHash,
                    fileIndex: file.index,
                    subtitles: torrent.subtitleTracks,
                  },
                  res,
                );
              }}
              onDeleteTorrent={async (hash) => {
                await fetch(`/api/torrents/${hash}`, { method: 'DELETE' });
                await refreshTorrentsAndStorage();
              }}
              onPurgeTempCache={async () => {
                await fetch('/api/files/cache?scope=all', { method: 'DELETE' });
                await refreshTorrentsAndStorage();
                setNotice({ kind: 'info', text: 'Temporary stream cache purged.' });
              }}
              onPlayPermanentFile={handlePlayPermanentFile}
              onExportPermanentFile={handleExportPermanentFile}
              onDeletePermanentFile={async (id) => {
                await deletePermanentFile(id);
                await refreshPermanentStorage();
              }}
              onBulkDeletePermanentFiles={async (ids) => {
                await Promise.all(ids.map((id) => deletePermanentFile(id)));
                await refreshPermanentStorage();
              }}
              onOpenLoadModal={() => setIsAddModalOpen(true)}
            />

            {/* Open Cinema Archive */}
            <OpenArchiveSection
              items={archiveItems}
              onPlayMirror={handleMirrorLoaded}
              onStreamMagnet={handleStreamArchiveMagnet}
              loadingMagnetId={loadingMagnetId}
            />
          </>
        )}

        {activeView === 'search' && (
          <TorrentSearchPanel
            sites={indexerSites}
            onAddSite={(site) => setIndexerSites((prev) => [...prev, site])}
            onToggleSite={(siteId) =>
              setIndexerSites((prev) =>
                prev.map((s) => (s.id === siteId ? { ...s, enabled: !s.enabled } : s)),
              )
            }
            onRemoveSite={(siteId) =>
              setIndexerSites((prev) => prev.filter((s) => s.id !== siteId))
            }
            onStreamResult={(res) => handleSearchResultAction(res, 'stream')}
            onQueueResult={(res) => handleSearchResultAction(res, 'queue')}
          />
        )}

        {activeView === 'files' && (
          <FileManagerPanel
            torrents={torrents}
            permanentFiles={permanentFiles}
            tempDiskBytes={tempDiskBytes}
            tempCachedEntries={tempCachedEntries}
            browserQuota={browserQuota}
            selectedResolution={resolution}
            onPlayTorrentFile={playTorrentFile}
            onSaveTorrentFileOffline={(torrent, fileIdx, res) => {
              const file = torrent.files[fileIdx];
              if (!file) return;
              handleSaveToOfflineVault(
                {
                  id: `torrent-${torrent.infoHash}-${file.index}`,
                  title: file.name,
                  sourceKind: 'torrent',
                  formatLabel: file.extension.replace('.', '').toUpperCase() || 'MEDIA',
                  nativePlayable: file.nativePlayable,
                  fileSize: file.length,
                  infoHash: torrent.infoHash,
                  fileIndex: file.index,
                  subtitles: torrent.subtitleTracks,
                },
                res,
              );
            }}
            onDownloadTorrentFileToDevice={(torrent, fileIdx, res) => {
              const file = torrent.files[fileIdx];
              if (!file) return;
              handleSaveToDevice(
                {
                  id: `torrent-${torrent.infoHash}-${file.index}`,
                  title: file.name,
                  sourceKind: 'torrent',
                  formatLabel: file.extension.replace('.', '').toUpperCase() || 'MEDIA',
                  nativePlayable: file.nativePlayable,
                  fileSize: file.length,
                  infoHash: torrent.infoHash,
                  fileIndex: file.index,
                  subtitles: torrent.subtitleTracks,
                },
                res,
              );
            }}
            onDeleteTorrent={async (hash) => {
              await fetch(`/api/torrents/${hash}`, { method: 'DELETE' });
              await refreshTorrentsAndStorage();
            }}
            onPurgeTempCache={async () => {
              await fetch('/api/files/cache?scope=all', { method: 'DELETE' });
              await refreshTorrentsAndStorage();
              setNotice({ kind: 'info', text: 'Temporary stream cache purged.' });
            }}
            onPlayPermanentFile={handlePlayPermanentFile}
            onExportPermanentFile={handleExportPermanentFile}
            onDeletePermanentFile={async (id) => {
              await deletePermanentFile(id);
              await refreshPermanentStorage();
            }}
            onBulkDeletePermanentFiles={async (ids) => {
              await Promise.all(ids.map((id) => deletePermanentFile(id)));
              await refreshPermanentStorage();
            }}
            onOpenLoadModal={() => setIsAddModalOpen(true)}
          />
        )}

        {activeView === 'archive' && (
          <OpenArchiveSection
            items={archiveItems}
            onPlayMirror={handleMirrorLoaded}
            onStreamMagnet={handleStreamArchiveMagnet}
            loadingMagnetId={loadingMagnetId}
          />
        )}

        {activeView === 'subtitles' && (
          <SubtitleStudioPanel
            activeMediaTitle={currentMedia?.title || null}
            tracks={currentMedia?.subtitles || []}
            activeSubtitleId={activeSubtitleId}
            onSelectTrack={setActiveSubtitleId}
            onAttachSubtitleTrack={(track) => {
              setCurrentMedia((prev) =>
                prev ? { ...prev, subtitles: [...prev.subtitles, track] } : prev,
              );
              setActiveSubtitleId(track.id);
              setNotice({ kind: 'info', text: `Attached subtitle track "${track.label}".` });
            }}
            subtitleOffset={subtitleOffset}
            onSubtitleOffsetChange={setSubtitleOffset}
          />
        )}
      </main>

      <AddSourceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onTorrentLoaded={handleTorrentLoaded}
        onMirrorLoaded={handleMirrorLoaded}
      />
    </div>
  );
}
