import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Download,
  FileVideo,
  HardDrive,
  HardDriveDownload,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import type { ResolutionOption, TorrentSummary } from '../types/media.ts';
import { formatBytes, formatRelativeDate, formatSpeed } from '../utils/formatters.ts';
import type { PermanentFileRecord } from '../utils/offlineVault.ts';

interface FileManagerPanelProps {
  torrents: TorrentSummary[];
  permanentFiles: PermanentFileRecord[];
  tempDiskBytes: number;
  tempCachedEntries: number;
  browserQuota: { usage: number; quota: number } | null;
  selectedResolution: ResolutionOption;
  onPlayTorrentFile: (torrent: TorrentSummary, fileIndex: number) => void;
  onSaveTorrentFileOffline: (torrent: TorrentSummary, fileIndex: number, resolution: ResolutionOption) => void;
  onDownloadTorrentFileToDevice: (torrent: TorrentSummary, fileIndex: number, resolution: ResolutionOption) => void;
  onDeleteTorrent: (infoHash: string) => Promise<void>;
  onPurgeTempCache: () => Promise<void>;
  onPlayPermanentFile: (record: PermanentFileRecord) => Promise<void>;
  onExportPermanentFile: (record: PermanentFileRecord) => Promise<void>;
  onDeletePermanentFile: (id: string) => Promise<void>;
  onBulkDeletePermanentFiles: (ids: string[]) => Promise<void>;
  onOpenLoadModal: () => void;
}

type StorageFilter = 'all' | 'temporary' | 'permanent';
type SortField = 'name' | 'size' | 'date' | 'format' | 'progress';

interface UnifiedFileRow {
  rowId: string;
  tier: 'temporary' | 'permanent';
  name: string;
  parentLabel: string;
  formatLabel: string;
  resolutionLabel: string;
  sizeBytes: number;
  progress: number;
  speedBytesPerSec: number;
  numPeers: number;
  timestamp: number;
  playable: boolean;
  torrent?: TorrentSummary;
  fileIndex?: number;
  permanentRecord?: PermanentFileRecord;
}

export function FileManagerPanel({
  torrents,
  permanentFiles,
  tempDiskBytes,
  tempCachedEntries,
  browserQuota,
  selectedResolution,
  onPlayTorrentFile,
  onSaveTorrentFileOffline,
  onDownloadTorrentFileToDevice,
  onDeleteTorrent,
  onPurgeTempCache,
  onPlayPermanentFile,
  onExportPermanentFile,
  onDeletePermanentFile,
  onBulkDeletePermanentFiles,
  onOpenLoadModal,
}: FileManagerPanelProps) {
  const [tierFilter, setTierFilter] = useState<StorageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isPurging, setIsPurging] = useState(false);

  const unifiedRows: UnifiedFileRow[] = useMemo(() => {
    const rows: UnifiedFileRow[] = [];

    for (const torrent of torrents) {
      for (const file of torrent.files) {
        if (file.category === 'other' && file.length < 1024) continue;
        rows.push({
          rowId: `temp:${torrent.infoHash}:${file.index}`,
          tier: 'temporary',
          name: file.name,
          parentLabel: `${torrent.name} · ${torrent.infoHash.slice(0, 8)}`,
          formatLabel: file.extension.replace('.', '').toUpperCase() || file.category.toUpperCase(),
          resolutionLabel: file.category === 'subtitle' ? 'Subtitle' : 'Stream Cache',
          sizeBytes: file.length,
          progress: Math.round((file.progress || torrent.progress || 0) * 100),
          speedBytesPerSec: torrent.downloadSpeed,
          numPeers: torrent.numPeers,
          timestamp: Date.now(),
          playable: file.category === 'video' || file.category === 'audio',
          torrent,
          fileIndex: file.index,
        });
      }
    }

    for (const rec of permanentFiles) {
      rows.push({
        rowId: `perm:${rec.id}`,
        tier: 'permanent',
        name: rec.filename,
        parentLabel: rec.hasBlob ? 'Offline Browser Vault' : 'Saved to Device Disk',
        formatLabel: rec.formatLabel,
        resolutionLabel: rec.resolution,
        sizeBytes: rec.sizeBytes,
        progress: 100,
        speedBytesPerSec: 0,
        numPeers: 0,
        timestamp: rec.createdAt,
        playable: rec.hasBlob,
        permanentRecord: rec,
      });
    }

    return rows;
  }, [torrents, permanentFiles]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = unifiedRows.filter((row) => {
      if (tierFilter !== 'all' && row.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.parentLabel.toLowerCase().includes(q) ||
        row.formatLabel.toLowerCase().includes(q) ||
        row.resolutionLabel.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.sizeBytes - b.sizeBytes;
          break;
        case 'format':
          cmp = a.formatLabel.localeCompare(b.formatLabel);
          break;
        case 'progress':
          cmp = a.progress - b.progress;
          break;
        case 'date':
        default:
          cmp = a.timestamp - b.timestamp;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [unifiedRows, tierFilter, searchQuery, sortField, sortAsc]);

  const permanentVaultBytes = useMemo(
    () => permanentFiles.reduce((acc, f) => acc + (f.hasBlob ? f.sizeBytes : 0), 0),
    [permanentFiles],
  );

  const toggleRowSelection = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRowIds.size === filteredRows.length && filteredRows.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredRows.map((r) => r.rowId)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRowIds.size === 0) return;
    const permIds: string[] = [];
    const torrentHashes = new Set<string>();

    for (const row of filteredRows) {
      if (!selectedRowIds.has(row.rowId)) continue;
      if (row.tier === 'permanent' && row.permanentRecord) {
        permIds.push(row.permanentRecord.id);
      } else if (row.tier === 'temporary' && row.torrent) {
        torrentHashes.add(row.torrent.infoHash);
      }
    }

    if (permIds.length > 0) {
      await onBulkDeletePermanentFiles(permIds);
    }
    for (const hash of torrentHashes) {
      await onDeleteTorrent(hash);
    }
    setSelectedRowIds(new Set());
  };

  const handlePurgeTemp = async () => {
    setIsPurging(true);
    try {
      await onPurgeTempCache();
      setSelectedRowIds(new Set());
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">File & Storage Management</h2>
          <p className="text-sm text-slate-400">
            Search, sort, and manage temporary torrent stream caches alongside permanently downloaded offline files.
          </p>
        </div>

        <button
          type="button"
          disabled={isPurging || (torrents.length === 0 && tempDiskBytes === 0)}
          onClick={handlePurgeTemp}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#12151C] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 px-3.5 py-2 text-xs font-medium text-slate-300 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isPurging ? 'Purging Cache...' : 'Purge Temp Cache'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#12151C] px-5 py-4">
          <p className="text-xs font-medium text-slate-400">Temporary Stream Cache</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
            {formatBytes(tempDiskBytes)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {torrents.length} Active Torrents · {tempCachedEntries} Cached Files
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12151C] px-5 py-4">
          <p className="text-xs font-medium text-slate-400">Permanently Downloaded</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
            {formatBytes(permanentVaultBytes)}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {permanentFiles.filter((f) => f.hasBlob).length} Offline Vault ·{' '}
            {permanentFiles.filter((f) => !f.hasBlob).length} Device Exports
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12151C] px-5 py-4">
          <p className="text-xs font-medium text-slate-400">Browser Offline Quota</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
            {browserQuota ? formatBytes(browserQuota.quota - browserQuota.usage) : 'Available'}
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {browserQuota
              ? `${formatBytes(browserQuota.usage)} used of ${formatBytes(browserQuota.quota)}`
              : 'IndexedDB persistent storage ready'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#12151C] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-1 rounded-lg bg-[#0B0D11] p-1 border border-white/5 overflow-x-auto">
            {(
              [
                { id: 'all', label: `All Files (${unifiedRows.length})` },
                {
                  id: 'temporary',
                  label: `Temporary Stream Data (${unifiedRows.filter((r) => r.tier === 'temporary').length})`,
                },
                {
                  id: 'permanent',
                  label: `Permanently Downloaded (${unifiedRows.filter((r) => r.tier === 'permanent').length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setTierFilter(tab.id);
                  setSelectedRowIds(new Set());
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  tierFilter === tab.id
                    ? 'bg-[#1D222E] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files, formats, hashes..."
                className="w-56 rounded-lg border border-white/10 bg-[#0B0D11] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              aria-label="Sort files by"
              className="rounded-lg border border-white/10 bg-[#0B0D11] px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              <option value="date">Sort: Date</option>
              <option value="name">Sort: Name</option>
              <option value="size">Sort: Size</option>
              <option value="format">Sort: Format</option>
              <option value="progress">Sort: Progress</option>
            </select>

            <button
              type="button"
              onClick={() => setSortAsc((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B0D11] hover:bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 cursor-pointer"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {sortAsc ? 'Asc' : 'Desc'}
            </button>

            {selectedRowIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 px-3 py-1.5 text-xs font-medium text-red-200 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Selected ({selectedRowIds.size})
              </button>
            )}
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <HardDrive className="h-9 w-9 text-slate-500 mb-3" />
            <p className="text-sm font-medium text-slate-200">
              {unifiedRows.length === 0
                ? 'No active torrent streams or offline files yet'
                : 'No files match your current search or filter'}
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              {unifiedRows.length === 0
                ? 'Load a magnet link, upload a .torrent file, or save any stream offline in your selected resolution.'
                : 'Try clearing your search query or switching between Temporary Stream Data and Permanently Downloaded.'}
            </p>
            {unifiedRows.length === 0 && (
              <button
                type="button"
                onClick={onOpenLoadModal}
                className="mt-4 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors cursor-pointer"
              >
                Load Torrent or Mirror
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#0B0D11]/60 text-[11px] font-medium text-slate-400">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.size === filteredRows.length && filteredRows.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="Select all visible files"
                      className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5">File Name</th>
                  <th className="px-3 py-2.5">Storage Tier</th>
                  <th className="px-3 py-2.5">Format</th>
                  <th className="px-3 py-2.5 text-right">Size</th>
                  <th className="px-3 py-2.5 text-right">Status / Speed</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredRows.map((row) => {
                  const isSelected = selectedRowIds.has(row.rowId);
                  return (
                    <tr
                      key={row.rowId}
                      className={`h-11 transition-colors hover:bg-white/[0.03] ${
                        isSelected ? 'bg-amber-500/[0.06]' : ''
                      }`}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRowSelection(row.rowId)}
                          aria-label={`Select ${row.name}`}
                          className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-amber-500 cursor-pointer"
                        />
                      </td>

                      <td className="px-3 py-2 max-w-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileVideo className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-100">{row.name}</p>
                            <p className="truncate text-[11px] text-slate-400">{row.parentLabel}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.tier === 'temporary' ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-300">
                            <HardDrive className="h-3.5 w-3.5" />
                            Temporary Stream Cache
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400">
                            <HardDriveDownload className="h-3.5 w-3.5" />
                            Permanent Offline
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-300">
                        {row.formatLabel} · {row.resolutionLabel}
                      </td>

                      <td className="px-3 py-2 text-right font-mono text-slate-200 tabular-nums whitespace-nowrap">
                        {formatBytes(row.sizeBytes)}
                      </td>

                      <td className="px-3 py-2 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                        {row.tier === 'temporary' ? (
                          <span>
                            {row.progress}% · {formatSpeed(row.speedBytesPerSec)} · {row.numPeers}p
                          </span>
                        ) : (
                          <span>Saved · {formatRelativeDate(row.timestamp)}</span>
                        )}
                      </td>

                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {row.tier === 'temporary' && row.torrent && row.fileIndex !== undefined && (
                            <>
                              {row.playable && (
                                <button
                                  type="button"
                                  onClick={() => onPlayTorrentFile(row.torrent!, row.fileIndex!)}
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950 cursor-pointer"
                                >
                                  <Play className="h-3 w-3 fill-current" />
                                  Play
                                </button>
                              )}
                              {row.playable && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSaveTorrentFileOffline(row.torrent!, row.fileIndex!, selectedResolution)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2 py-1 text-[11px] text-slate-200 cursor-pointer"
                                  title={`Promote to Permanent Offline Vault (${selectedResolution})`}
                                >
                                  <HardDriveDownload className="h-3 w-3 text-amber-400" />
                                  Save Offline
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  onDownloadTorrentFileToDevice(row.torrent!, row.fileIndex!, selectedResolution)
                                }
                                className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                                title={`Download to device (${selectedResolution})`}
                                aria-label={`Download ${row.name}`}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTorrent(row.torrent!.infoHash)}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300 cursor-pointer"
                                title="Delete torrent & temporary cache"
                                aria-label={`Delete ${row.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}

                          {row.tier === 'permanent' && row.permanentRecord && (
                            <>
                              {row.permanentRecord.hasBlob && (
                                <button
                                  type="button"
                                  onClick={() => onPlayPermanentFile(row.permanentRecord!)}
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950 cursor-pointer"
                                >
                                  <Play className="h-3 w-3 fill-current" />
                                  Play Offline
                                </button>
                              )}
                              {row.permanentRecord.hasBlob && (
                                <button
                                  type="button"
                                  onClick={() => onExportPermanentFile(row.permanentRecord!)}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                                  title="Export copy to device"
                                  aria-label={`Export ${row.name}`}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeletePermanentFile(row.permanentRecord!.id)}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300 cursor-pointer"
                                title="Delete permanently"
                                aria-label={`Delete ${row.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
