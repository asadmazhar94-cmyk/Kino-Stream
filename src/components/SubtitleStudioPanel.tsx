import { useRef, useState } from 'react';
import { Captions, Download, Link2, Upload } from 'lucide-react';
import type { SubtitleTrack } from '../types/media.ts';
import { formatDuration, parseWebVttCues } from '../utils/formatters.ts';

interface SubtitleStudioPanelProps {
  activeMediaTitle: string | null;
  tracks: SubtitleTrack[];
  activeSubtitleId: string | null;
  onSelectTrack: (id: string | null) => void;
  onAttachSubtitleTrack: (track: SubtitleTrack) => void;
  subtitleOffset: number;
  onSubtitleOffsetChange: (offset: number) => void;
}

export function SubtitleStudioPanel({
  activeMediaTitle,
  tracks,
  activeSubtitleId,
  onSelectTrack,
  onAttachSubtitleTrack,
  subtitleOffset,
  onSubtitleOffsetChange,
}: SubtitleStudioPanelProps) {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [customLanguage, setCustomLanguage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewTrack, setPreviewTrack] = useState<SubtitleTrack | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPreview = async (track: SubtitleTrack) => {
    setPreviewTrack(track);
    if (track.vttContent) {
      setPreviewText(track.vttContent);
      return;
    }
    if (track.url) {
      try {
        const resp = await fetch(track.url);
        const text = await resp.text();
        setPreviewText(text);
      } catch {
        setPreviewText('');
      }
    }
  };

  const handleUploadFile = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (customLanguage.trim()) {
        formData.append('language', customLanguage.trim());
      }
      const resp = await fetch('/api/subtitles/convert', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Subtitle conversion failed');

      const newTrack: SubtitleTrack = {
        id: data.id,
        label: data.label,
        language: data.language,
        source: 'external',
        vttContent: data.vttContent,
      };
      onAttachSubtitleTrack(newTrack);
      setPreviewTrack(newTrack);
      setPreviewText(data.vttContent);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse subtitle file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadRemoteUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteUrl.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/subtitles/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: remoteUrl.trim(),
          language: customLanguage.trim() || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch subtitle');

      const newTrack: SubtitleTrack = {
        id: data.id,
        label: data.label,
        language: data.language,
        source: 'external',
        vttContent: data.vttContent,
      };
      onAttachSubtitleTrack(newTrack);
      setPreviewTrack(newTrack);
      setPreviewText(data.vttContent);
      setRemoteUrl('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load subtitle URL');
    } finally {
      setIsLoading(false);
    }
  };

  const cues = previewText ? parseWebVttCues(previewText).slice(0, 60) : [];

  const handleDownloadVtt = () => {
    if (!previewText || !previewTrack) return;
    const blob = new Blob([previewText], { type: 'text/vtt;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${previewTrack.language || 'subtitles'}.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">International Subtitle Studio</h2>
        <p className="text-sm text-slate-400">
          Convert and sync UTF-8 international subtitles (.SRT, .VTT, .ASS, .SSA, .SUB) across Latin, Arabic, Japanese, Korean, Chinese, and Cyrillic scripts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#12151C] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Import Subtitle File</h3>
              <span className="text-xs text-slate-400">
                {activeMediaTitle ? `Target: ${activeMediaTitle}` : 'Attach to next stream'}
              </span>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3">
              <input
                type="text"
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                placeholder="Optional language code or label (e.g., ja, ar, es, French)"
                className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />

              <button
                type="button"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-[#0B0D11] hover:border-amber-500/60 px-4 py-4 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                <Upload className="h-4 w-4 text-amber-400" />
                {isLoading ? 'Converting to WebVTT...' : 'Upload .SRT, .VTT, .ASS, .SSA, or .SUB'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.vtt,.ass,.ssa,.sub"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadFile(file);
                  e.target.value = '';
                }}
              />

              <form onSubmit={handleLoadRemoteUrl} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder="https://example.com/subtitles.srt"
                    className="w-full rounded-lg border border-white/10 bg-[#0B0D11] pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !remoteUrl.trim()}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  Import URL
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#12151C] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Available Subtitle Tracks ({tracks.length})
              </h3>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400">Sync:</span>
                <button
                  type="button"
                  onClick={() => onSubtitleOffsetChange(Number((subtitleOffset - 0.5).toFixed(1)))}
                  className="rounded bg-white/5 hover:bg-white/10 px-1.5 py-0.5 text-slate-300 cursor-pointer"
                >
                  -0.5s
                </button>
                <span className="font-mono text-amber-400 tabular-nums">
                  {subtitleOffset >= 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
                </span>
                <button
                  type="button"
                  onClick={() => onSubtitleOffsetChange(Number((subtitleOffset + 0.5).toFixed(1)))}
                  className="rounded bg-white/5 hover:bg-white/10 px-1.5 py-0.5 text-slate-300 cursor-pointer"
                >
                  +0.5s
                </button>
              </div>
            </div>

            {tracks.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                No subtitle tracks loaded for the current media yet. Play an Archive film or upload a subtitle file above.
              </p>
            ) : (
              <div className="divide-y divide-white/5">
                {tracks.map((track) => {
                  const isActive = activeSubtitleId === track.id;
                  return (
                    <div key={track.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">{track.label}</p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {track.language} · {track.source}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadPreview(track)}
                          className="rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] text-slate-200 cursor-pointer"
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTrack(isActive ? null : track.id)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                            isActive
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-white/10 text-slate-200 hover:bg-white/15'
                          }`}
                        >
                          {isActive ? 'Active' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#12151C] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Captions className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">
                {previewTrack ? previewTrack.label : 'Cue Timeline Preview'}
              </span>
            </div>
            {previewTrack && previewText && (
              <button
                type="button"
                onClick={handleDownloadVtt}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-amber-400" />
                Export .VTT
              </button>
            )}
          </div>

          {cues.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <p className="text-sm text-slate-300">Select “Inspect” on any subtitle track or import a file</p>
              <p className="mt-1 text-xs text-slate-400">
                Normalized WebVTT cues and RTL/UTF-8 international characters appear here for verification.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
              {cues.map((cue, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 px-5 py-2.5 text-xs">
                  <div className="col-span-4 sm:col-span-3 font-mono text-slate-400 tabular-nums">
                    {formatDuration(cue.start)} → {formatDuration(cue.end)}
                  </div>
                  <div dir="auto" className="col-span-8 sm:col-span-9 text-slate-100 whitespace-pre-line">
                    {cue.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
