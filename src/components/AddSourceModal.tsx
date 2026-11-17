import { useRef, useState } from 'react';
import { FileUp, Link2, Magnet, Plus, Trash2, X } from 'lucide-react';
import type { PlayableMediaItem, TorrentSummary } from '../types/media.ts';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTorrentLoaded: (torrent: TorrentSummary) => void;
  onMirrorLoaded: (item: PlayableMediaItem) => void;
}

type SourceTab = 'magnet' | 'torrent' | 'mirror';

export function AddSourceModal({
  isOpen,
  onClose,
  onTorrentLoaded,
  onMirrorLoaded,
}: AddSourceModalProps) {
  const [tab, setTab] = useState<SourceTab>('magnet');
  const [magnetUri, setMagnetUri] = useState('');
  const [selectedTorrentFile, setSelectedTorrentFile] = useState<File | null>(null);
  const [mirrorUrl, setMirrorUrl] = useState('');
  const [mirrorTitle, setMirrorTitle] = useState('');
  const [fallbackMirrors, setFallbackMirrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleLoadMagnet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magnetUri.trim()) {
      setErrorMsg('Enter a magnet:? link or direct .torrent URL.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sources/magnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnetUri: magnetUri.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to resolve magnet link');
      }
      onTorrentLoaded(data.torrent);
      setMagnetUri('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to stream magnet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadTorrent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTorrentFile) {
      setErrorMsg('Choose a .torrent file from your computer.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedTorrentFile);
      const resp = await fetch('/api/sources/torrent', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to parse torrent file');
      }
      onTorrentLoaded(data.torrent);
      setSelectedTorrentFile(null);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load torrent file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMirror = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mirrorUrl.trim()) {
      setErrorMsg('Enter a valid HTTP or HTTPS mirror link.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/sources/mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: mirrorUrl.trim(),
          title: mirrorTitle.trim() || undefined,
          fallbackUrls: fallbackMirrors.map((u) => u.trim()).filter(Boolean),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Mirror probe failed');
      }
      onMirrorLoaded(data.item);
      setMirrorUrl('');
      setMirrorTitle('');
      setFallbackMirrors([]);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to inspect mirror URL');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#12151C] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 id="add-source-title" className="text-lg font-semibold text-white">
              Load Media Source
            </h2>
            <p className="text-xs text-slate-400">
              Stream directly in your browser from magnet protocols, .torrent files, or mirror links.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Segmented Protocol Selector */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#0B0D11] p-1 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setTab('magnet');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 px-3 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'magnet'
                  ? 'bg-[#1D222E] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Magnet className="h-3.5 w-3.5 text-amber-400" />
              Magnet Link
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('torrent');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 px-3 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'torrent'
                  ? 'bg-[#1D222E] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileUp className="h-3.5 w-3.5 text-amber-400" />
              Torrent File
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('mirror');
                setErrorMsg(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 px-3 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'mirror'
                  ? 'bg-[#1D222E] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Link2 className="h-3.5 w-3.5 text-amber-400" />
              Mirror URL
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {errorMsg}
            </div>
          )}

          {tab === 'magnet' && (
            <form onSubmit={handleLoadMagnet} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Magnet URI or Remote .torrent URL
                </label>
                <textarea
                  rows={3}
                  value={magnetUri}
                  onChange={(e) => setMagnetUri(e.target.value)}
                  placeholder="magnet:?xt=urn:btih:... or https://example.com/movie.torrent"
                  className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3.5 py-2.5 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  Supports DHT, UDP/WSS trackers, HTTP web seeds, multi-file torrents, and sidecar subtitles.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {isLoading ? 'Connecting Peers...' : 'Stream Magnet'}
                </button>
              </div>
            </form>
          )}

          {tab === 'torrent' && (
            <form onSubmit={handleUploadTorrent} className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.files[0];
                  if (dropped) setSelectedTorrentFile(dropped);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#0B0D11] px-6 py-8 text-center hover:border-amber-500/60 transition-colors cursor-pointer"
              >
                <FileUp className="h-8 w-8 text-amber-400 mb-2.5" />
                <p className="text-sm font-medium text-slate-200">
                  {selectedTorrentFile ? selectedTorrentFile.name : 'Drop a .torrent file here or browse'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  All video, audio, and subtitle files inside the torrent will appear in your queue.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".torrent,application/x-bittorrent"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedTorrentFile(file);
                  }}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !selectedTorrentFile}
                  className="px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {isLoading ? 'Loading Torrent...' : 'Parse & Stream'}
                </button>
              </div>
            </form>
          )}

          {tab === 'mirror' && (
            <form onSubmit={handleLoadMirror} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Primary Mirror Link (MP4, MKV, WebM, AVI, MOV, FLAC, MP3)
                </label>
                <input
                  type="url"
                  value={mirrorUrl}
                  onChange={(e) => setMirrorUrl(e.target.value)}
                  placeholder="https://cdn.example.com/media/film.mkv"
                  className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Display Title (Optional)
                </label>
                <input
                  type="text"
                  value={mirrorTitle}
                  onChange={(e) => setMirrorTitle(e.target.value)}
                  placeholder="e.g., Documentary Master Cut"
                  className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Fallback Mirror Links ({fallbackMirrors.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setFallbackMirrors((prev) => [...prev, ''])}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Mirror
                  </button>
                </div>
                {fallbackMirrors.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => {
                        const next = [...fallbackMirrors];
                        next[idx] = e.target.value;
                        setFallbackMirrors(next);
                      }}
                      placeholder={`https://mirror-${idx + 2}.example.com/video.mp4`}
                      className="flex-1 rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFallbackMirrors((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-slate-400 hover:text-red-400 cursor-pointer"
                      aria-label="Remove fallback mirror"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-lg border border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  {isLoading ? 'Probing Stream...' : 'Stream Mirror'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
