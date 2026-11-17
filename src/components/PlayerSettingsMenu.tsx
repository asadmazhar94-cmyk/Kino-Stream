import { useRef } from 'react';
import {
  Check,
  Download,
  FastForward,
  HardDriveDownload,
  Server,
  SlidersHorizontal,
} from 'lucide-react';
import type { PlayableMediaItem, ResolutionOption, SubtitleTrack } from '../types/media.ts';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const RESOLUTION_OPTIONS: ResolutionOption[] = ['original', '1080p', '720p', '480p', '360p'];

export type SubFontSize = 'sm' | 'md' | 'lg' | 'xl';

interface SettingsMenuProps {
  media: PlayableMediaItem;
  isOfflineLocal: boolean;
  resolution: ResolutionOption;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  onResolutionSelect: (res: ResolutionOption) => void;
  onSwitchMirror: (index: number) => void;
  onClose: () => void;
}

export function PlayerSettingsPopover({
  media,
  isOfflineLocal,
  resolution,
  playbackSpeed,
  onPlaybackSpeedChange,
  onResolutionSelect,
  onSwitchMirror,
  onClose,
}: SettingsMenuProps) {
  return (
    <div className="absolute right-0 bottom-12 z-40 w-72 rounded-xl border border-white/10 bg-[#141821]/95 p-4 shadow-2xl backdrop-blur-md space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
            <FastForward className="h-3.5 w-3.5 text-amber-400" />
            Playback Speed
          </span>
          <span className="font-mono text-xs text-amber-400 tabular-nums">
            {playbackSpeed.toFixed(2).replace(/\.00$/, '')}x
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {SPEED_OPTIONS.map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => onPlaybackSpeedChange(spd)}
              className={`rounded-md py-1.5 text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                playbackSpeed === spd
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {!isOfflineLocal && (
        <div className="border-t border-white/10 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400" />
              Stream Resolution
            </span>
            <span className="text-[11px] text-slate-400">{media.nativeResolution || 'Auto'}</span>
          </div>
          <div className="space-y-1">
            {RESOLUTION_OPTIONS.map((resOpt) => {
              const selected = resolution === resOpt;
              return (
                <button
                  key={resOpt}
                  type="button"
                  onClick={() => onResolutionSelect(resOpt)}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                    selected
                      ? 'bg-amber-500/20 text-amber-300 font-medium'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>{resOpt === 'original' ? 'Original Source (Direct)' : `${resOpt} Transcode`}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {media.mirrors && media.mirrors.length > 1 && (
        <div className="border-t border-white/10 pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
            <Server className="h-3.5 w-3.5 text-amber-400" />
            Mirror Link
          </span>
          <div className="space-y-1">
            {media.mirrors.map((m, idx) => {
              const active = (media.activeMirrorIndex ?? 0) === idx;
              return (
                <button
                  key={m.url}
                  type="button"
                  onClick={() => {
                    onSwitchMirror(idx);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500/20 text-amber-300 font-medium'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{m.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface SubtitlesPopoverProps {
  subtitles: SubtitleTrack[];
  activeSubtitleId: string | null;
  onSelectSubtitleId: (id: string | null) => void;
  subFontSize: SubFontSize;
  onSubFontSizeChange: (sz: SubFontSize) => void;
  subtitleOffset: number;
  onSubtitleOffsetChange: (offset: number) => void;
  onUploadSubtitleFile: (file: File) => Promise<void>;
  onDownloadActiveSubtitle: () => void;
}

export function SubtitlesPopover({
  subtitles,
  activeSubtitleId,
  onSelectSubtitleId,
  subFontSize,
  onSubFontSizeChange,
  subtitleOffset,
  onSubtitleOffsetChange,
  onUploadSubtitleFile,
  onDownloadActiveSubtitle,
}: SubtitlesPopoverProps) {
  const subUploadRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="absolute right-0 bottom-12 z-40 w-80 rounded-xl border border-white/10 bg-[#141821]/95 p-4 shadow-2xl backdrop-blur-md space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">International Subtitles</span>
        <button
          type="button"
          onClick={() => subUploadRef.current?.click()}
          className="text-xs font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
        >
          + Upload .SRT / .VTT / .ASS
        </button>
        <input
          ref={subUploadRef}
          type="file"
          accept=".srt,.vtt,.ass,.ssa,.sub"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await onUploadSubtitleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
        <button
          type="button"
          onClick={() => onSelectSubtitleId(null)}
          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
            !activeSubtitleId
              ? 'bg-amber-500/20 text-amber-300 font-medium'
              : 'text-slate-300 hover:bg-white/5'
          }`}
        >
          <span>Off</span>
          {!activeSubtitleId && <Check className="h-3.5 w-3.5 text-amber-400" />}
        </button>
        {subtitles.map((sub) => {
          const active = activeSubtitleId === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => onSelectSubtitleId(sub.id)}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                active
                  ? 'bg-amber-500/20 text-amber-300 font-medium'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <span className="truncate text-left">{sub.label}</span>
              {active && <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/10 pt-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Text Size</span>
          <div className="flex items-center gap-1">
            {(['sm', 'md', 'lg', 'xl'] as SubFontSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onSubFontSizeChange(sz)}
                className={`rounded px-2 py-1 text-[11px] uppercase cursor-pointer ${
                  subFontSize === sz
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Timing Sync</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSubtitleOffsetChange(Number((subtitleOffset - 0.5).toFixed(1)))}
              className="rounded bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-slate-200 cursor-pointer"
            >
              -0.5s
            </button>
            <span className="w-14 text-center font-mono text-xs text-amber-400 tabular-nums">
              {subtitleOffset >= 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
            </span>
            <button
              type="button"
              onClick={() => onSubtitleOffsetChange(Number((subtitleOffset + 0.5).toFixed(1)))}
              className="rounded bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-slate-200 cursor-pointer"
            >
              +0.5s
            </button>
          </div>
        </div>

        {activeSubtitleId && (
          <button
            type="button"
            onClick={onDownloadActiveSubtitle}
            className="w-full rounded-md border border-white/10 bg-white/5 hover:bg-white/10 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
          >
            Download Active Subtitle (.vtt)
          </button>
        )}
      </div>
    </div>
  );
}

interface OfflineDownloadPopoverProps {
  resolution: ResolutionOption;
  onResolutionChange: (res: ResolutionOption) => void;
  onSaveToDevice: () => void;
  onSaveToVault: () => void;
  vaultSavingProgress: number | null;
}

export function OfflineDownloadPopover({
  resolution,
  onResolutionChange,
  onSaveToDevice,
  onSaveToVault,
  vaultSavingProgress,
}: OfflineDownloadPopoverProps) {
  return (
    <div className="absolute right-0 bottom-12 z-40 w-72 rounded-xl border border-white/10 bg-[#141821]/95 p-4 shadow-2xl backdrop-blur-md space-y-3">
      <div>
        <p className="text-xs font-semibold text-white">Offline Download</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Selected resolution: <span className="text-amber-400 font-mono">{resolution}</span>
        </p>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {RESOLUTION_OPTIONS.map((resOpt) => (
          <button
            key={resOpt}
            type="button"
            onClick={() => onResolutionChange(resOpt)}
            className={`rounded py-1 text-[11px] font-mono transition-colors cursor-pointer ${
              resolution === resOpt
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {resOpt === 'original' ? 'Orig' : resOpt}
          </button>
        ))}
      </div>

      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={onSaveToDevice}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 py-2 text-xs font-semibold text-slate-950 transition-colors cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          Download to Device ({resolution})
        </button>

        <button
          type="button"
          disabled={vaultSavingProgress !== null}
          onClick={onSaveToVault}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 py-2 text-xs font-medium text-white disabled:opacity-50 transition-colors cursor-pointer"
        >
          <HardDriveDownload className="h-3.5 w-3.5 text-amber-400" />
          Save to Offline Vault ({resolution})
        </button>
      </div>
    </div>
  );
}
