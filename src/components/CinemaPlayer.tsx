import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions,
  Download,
  Film,
  HardDriveDownload,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { PlayableMediaItem, ResolutionOption, SubtitleTrack } from '../types/media.ts';
import { formatBytes, formatDuration, parseWebVttCues, type ParsedCue } from '../utils/formatters.ts';
import {
  OfflineDownloadPopover,
  PlayerSettingsPopover,
  SubtitlesPopover,
  type SubFontSize,
} from './PlayerSettingsMenu.tsx';

interface CinemaPlayerProps {
  media: PlayableMediaItem | null;
  offlineBlobUrl: string | null;
  resolution: ResolutionOption;
  onResolutionChange: (res: ResolutionOption) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  activeSubtitleId: string | null;
  onSelectSubtitleId: (id: string | null) => void;
  subtitleOffset: number;
  onSubtitleOffsetChange: (offset: number) => void;
  onSwitchMirror: (index: number) => void;
  onUploadSubtitleFile: (file: File) => Promise<void>;
  onSaveToDevice: (media: PlayableMediaItem, resolution: ResolutionOption) => void;
  onSaveToOfflineVault: (media: PlayableMediaItem, resolution: ResolutionOption) => void;
  vaultSavingProgress: number | null;
  onOpenLoadModal: () => void;
  onPlayFeatured: () => void;
}

export function CinemaPlayer({
  media,
  offlineBlobUrl,
  resolution,
  onResolutionChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  activeSubtitleId,
  onSelectSubtitleId,
  subtitleOffset,
  onSubtitleOffsetChange,
  onSwitchMirror,
  onUploadSubtitleFile,
  onSaveToDevice,
  onSaveToOfflineVault,
  vaultSavingProgress,
  onOpenLoadModal,
  onPlayFeatured,
}: CinemaPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [rawTime, setRawTime] = useState(0);
  const [seekOffset, setSeekOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [openMenu, setOpenMenu] = useState<'none' | 'settings' | 'subtitles' | 'download'>('none');
  const [subFontSize, setSubFontSize] = useState<SubFontSize>('md');
  const [parsedCues, setParsedCues] = useState<ParsedCue[]>([]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const isOfflineLocal = Boolean(offlineBlobUrl);
  const isTranscoded = useMemo(() => {
    if (!media || isOfflineLocal) return false;
    return resolution !== 'original' || !media.nativePlayable;
  }, [media, isOfflineLocal, resolution]);

  const activeMirror = useMemo(() => {
    if (!media?.mirrors || media.mirrors.length === 0) return null;
    const idx = media.activeMirrorIndex ?? 0;
    return media.mirrors[idx] || media.mirrors[0];
  }, [media]);

  const streamSrc = useMemo(() => {
    if (!media) return '';
    if (offlineBlobUrl) return offlineBlobUrl;
    if (media.sourceKind === 'torrent' || media.sourceKind === 'magnet') {
      if (!media.infoHash || media.fileIndex === undefined) return '';
      const base = `/api/stream/torrent/${encodeURIComponent(media.infoHash)}/${media.fileIndex}`;
      const params = new URLSearchParams({ resolution });
      if (isTranscoded && seekOffset > 0) {
        params.set('t', String(Math.floor(seekOffset)));
      }
      return `${base}?${params.toString()}`;
    }
    if (activeMirror) {
      const params = new URLSearchParams({
        url: activeMirror.url,
        resolution,
      });
      if (isTranscoded && seekOffset > 0) {
        params.set('t', String(Math.floor(seekOffset)));
      }
      return `/api/stream/mirror?${params.toString()}`;
    }
    return '';
  }, [media, offlineBlobUrl, resolution, isTranscoded, seekOffset, activeMirror]);

  useEffect(() => {
    setSeekOffset(0);
    setRawTime(0);
    setDuration(media?.duration || 0);
    setMediaError(null);
    setIsPlaying(false);
  }, [media?.id, offlineBlobUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, streamSrc]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const activeSubtitle: SubtitleTrack | undefined = useMemo(
    () => media?.subtitles.find((s) => s.id === activeSubtitleId),
    [media?.subtitles, activeSubtitleId],
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeSubtitle) {
      setParsedCues([]);
      return;
    }

    const loadCues = async () => {
      try {
        let vtt = activeSubtitle.vttContent || '';
        if (!vtt && activeSubtitle.url) {
          const resp = await fetch(activeSubtitle.url);
          if (!resp.ok) throw new Error('Subtitle fetch failed');
          vtt = await resp.text();
        }
        if (!cancelled) {
          setParsedCues(parseWebVttCues(vtt));
        }
      } catch {
        if (!cancelled) setParsedCues([]);
      }
    };

    loadCues();
    return () => {
      cancelled = true;
    };
  }, [activeSubtitle]);

  const currentTime = isTranscoded ? seekOffset + rawTime : rawTime;
  const effectiveDuration = useMemo(() => {
    if (media?.duration && media.duration > 0) return Math.max(media.duration, duration);
    return duration;
  }, [media?.duration, duration]);

  const activeCueText = useMemo(() => {
    if (!activeSubtitle || parsedCues.length === 0) return '';
    const adjusted = currentTime - subtitleOffset;
    const matched = parsedCues.filter((c) => adjusted >= c.start && adjusted <= c.end);
    return matched.map((c) => c.text).join('\n');
  }, [activeSubtitle, parsedCues, currentTime, subtitleOffset]);

  const bumpControlsVisibility = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      if (isPlaying && openMenu === 'none') {
        setControlsVisible(false);
      }
    }, 3200);
  }, [isPlaying, openMenu]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamSrc) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [streamSrc]);

  const seekTo = useCallback(
    (targetSeconds: number) => {
      const clamped = Math.max(
        0,
        effectiveDuration > 0 ? Math.min(targetSeconds, effectiveDuration) : targetSeconds,
      );
      if (isTranscoded) {
        setSeekOffset(clamped);
        setRawTime(0);
        setIsBuffering(true);
        setTimeout(() => {
          videoRef.current?.play().catch(() => {});
        }, 120);
      } else if (videoRef.current) {
        videoRef.current.currentTime = clamped;
        setRawTime(clamped);
      }
    },
    [effectiveDuration, isTranscoded],
  );

  const handleResolutionSwitch = (nextRes: ResolutionOption) => {
    if (nextRes === resolution) return;
    const savedTimestamp = currentTime;
    const wasPlaying = isPlaying;
    setSeekOffset(savedTimestamp);
    setRawTime(0);
    onResolutionChange(nextRes);
    setOpenMenu('none');
    if (wasPlaying) {
      setTimeout(() => {
        videoRef.current?.play().catch(() => {});
      }, 220);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {
      // PiP unavailable
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!media) return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(currentTime - 10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(currentTime + 10);
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((m) => !m);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'c') {
        if (activeSubtitleId) {
          onSelectSubtitleId(null);
        } else if (media.subtitles.length > 0) {
          onSelectSubtitleId(media.subtitles[0].id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [media, togglePlay, seekTo, currentTime, activeSubtitleId, onSelectSubtitleId]);

  const subtitleSizeClass: Record<SubFontSize, string> = {
    sm: 'text-sm px-2.5 py-1',
    md: 'text-base md:text-lg px-3 py-1.5',
    lg: 'text-lg md:text-2xl px-4 py-1.5',
    xl: 'text-xl md:text-3xl px-5 py-2',
  };

  const handleDownloadActiveSubtitle = async () => {
    if (!activeSubtitle) return;
    let vtt = activeSubtitle.vttContent || '';
    if (!vtt && activeSubtitle.url) {
      const resp = await fetch(activeSubtitle.url);
      vtt = await resp.text();
    }
    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(media?.title || 'subtitles').replace(/[^a-z0-9._-]+/gi, '_')}_${activeSubtitle.language}.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  if (!media) {
    return (
      <section className="overflow-hidden rounded-xl border border-white/10 bg-[#12151C]">
        <div className="relative aspect-video w-full overflow-hidden bg-[#0B0D11]">
          <img
            src="/src/assets/images/cinema_stage_backdrop_1794926430299.jpg"
            alt="Private screening room"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D11] via-[#0B0D11]/65 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <h1 className="max-w-2xl text-2xl md:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              Stream torrents, magnet links, and mirrors directly in your browser.
            </h1>
            <p className="mt-3 max-w-xl text-sm md:text-base text-slate-300">
              No local BitTorrent client required. Adjust resolution and playback speed on the fly, load international subtitles, or save files offline in your chosen resolution.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenLoadModal}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="h-4 w-4" />
                Load Magnet, Torrent, or Mirror
              </button>
              <button
                type="button"
                onClick={onPlayFeatured}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#12151C]/90 hover:bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current text-amber-400" />
                Play Featured Film (Sintel)
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div
        ref={containerRef}
        onMouseMove={bumpControlsVisibility}
        onMouseLeave={() => {
          if (isPlaying && openMenu === 'none') setControlsVisible(false);
        }}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black select-none group"
      >
        <video
          ref={videoRef}
          src={streamSrc}
          poster={media.posterUrl}
          playsInline
          autoPlay
          onClick={() => {
            setOpenMenu('none');
            togglePlay();
          }}
          onPlay={() => {
            setIsPlaying(true);
            setMediaError(null);
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            if (videoRef.current) {
              videoRef.current.playbackRate = playbackSpeed;
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current && Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
              if (!isTranscoded) {
                setDuration(videoRef.current.duration);
              }
            }
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v) return;
            setRawTime(v.currentTime);
            if (v.buffered.length > 0) {
              setBufferedEnd(v.buffered.end(v.buffered.length - 1));
            }
          }}
          onError={() => {
            setIsBuffering(false);
            setIsPlaying(false);
            setMediaError(
              'Stream interrupted or format unsupported at this resolution. Try switching mirror links or selecting 720p / 480p transcode.',
            );
          }}
          className="h-full w-full object-contain bg-black"
        />

        {isBuffering && !mediaError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#12151C]/90 px-4 py-2.5 text-xs font-medium text-slate-200">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              {isTranscoded ? `Transcoding ${resolution} stream...` : 'Buffering media stream...'}
            </div>
          </div>
        )}

        {mediaError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
            <Film className="h-10 w-10 text-amber-400 mb-3" />
            <p className="max-w-md text-sm text-slate-200">{mediaError}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {media.mirrors && media.mirrors.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = ((media.activeMirrorIndex ?? 0) + 1) % media.mirrors!.length;
                    setMediaError(null);
                    onSwitchMirror(nextIdx);
                  }}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
                >
                  Switch to Fallback Mirror
                </button>
              )}
              {resolution === 'original' && (
                <button
                  type="button"
                  onClick={() => {
                    setMediaError(null);
                    handleResolutionSwitch('720p');
                  }}
                  className="rounded-lg border border-white/15 bg-white/10 hover:bg-white/15 px-4 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  Transcode to 720p MP4
                </button>
              )}
            </div>
          </div>
        )}

        {activeCueText && (
          <div
            className={`pointer-events-none absolute inset-x-4 flex justify-center transition-all duration-150 ${
              controlsVisible ? 'bottom-24' : 'bottom-8'
            }`}
          >
            <div
              dir="auto"
              className={`max-w-3xl whitespace-pre-line rounded-md bg-black/78 text-center font-medium leading-snug text-white shadow-lg ${subtitleSizeClass[subFontSize]}`}
            >
              {activeCueText}
            </div>
          </div>
        )}

        <div
          className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/30 to-transparent px-5 py-4 transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{media.title}</p>
              <p className="text-xs text-slate-300 font-mono tabular-nums">
                {isOfflineLocal ? 'Offline Vault' : media.sourceKind.toUpperCase()} ·{' '}
                {resolution === 'original' ? media.nativeResolution || 'Original' : resolution} ·{' '}
                {playbackSpeed}x
              </p>
            </div>
          </div>
        </div>

        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 pt-8 pb-3.5 transition-opacity duration-200 ${
            controlsVisible || openMenu !== 'none' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="relative mb-3 flex items-center">
            <div className="relative h-1.5 w-full rounded-full bg-white/20">
              {effectiveDuration > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                  style={{
                    width: `${Math.min(100, ((isTranscoded ? seekOffset + bufferedEnd : bufferedEnd) / effectiveDuration) * 100)}%`,
                  }}
                />
              )}
              {effectiveDuration > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
                  style={{
                    width: `${Math.min(100, (currentTime / effectiveDuration) * 100)}%`,
                  }}
                />
              )}
              <input
                type="range"
                min={0}
                max={effectiveDuration > 0 ? effectiveDuration : 100}
                step={0.5}
                value={Math.min(currentTime, effectiveDuration || 100)}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Seek timeline"
                className="cinema-range absolute inset-0 h-full w-full opacity-0 hover:opacity-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentTime - 10)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                aria-label="Rewind 10 seconds"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => seekTo(currentTime + 10)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                aria-label="Forward 10 seconds"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              <div className="hidden sm:flex items-center gap-1.5 pl-1">
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (v > 0 && isMuted) setIsMuted(false);
                  }}
                  aria-label="Volume"
                  className="cinema-range w-20"
                />
              </div>

              <span className="pl-2 font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
                {formatDuration(currentTime)} / {formatDuration(effectiveDuration)}
              </span>
            </div>

            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'subtitles' ? 'none' : 'subtitles'))}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSubtitleId
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Subtitles"
              >
                <Captions className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {activeSubtitle ? activeSubtitle.language.toUpperCase() : 'CC'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === 'settings' ? 'none' : 'settings'))}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  openMenu === 'settings'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Player quality and speed settings"
              >
                <Settings2 className="h-4 w-4" />
                <span className="font-mono tabular-nums hidden sm:inline">
                  {resolution === 'original' ? 'Orig' : resolution} · {playbackSpeed}x
                </span>
              </button>

              {!isOfflineLocal && (
                <button
                  type="button"
                  onClick={() => setOpenMenu((m) => (m === 'download' ? 'none' : 'download'))}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    openMenu === 'download'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  aria-label="Download for offline viewing"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden md:inline">Offline</span>
                </button>
              )}

              <button
                type="button"
                onClick={togglePiP}
                className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Picture in Picture"
              >
                <PictureInPicture2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>

              {openMenu === 'settings' && (
                <PlayerSettingsPopover
                  media={media}
                  isOfflineLocal={isOfflineLocal}
                  resolution={resolution}
                  playbackSpeed={playbackSpeed}
                  onPlaybackSpeedChange={onPlaybackSpeedChange}
                  onResolutionSelect={handleResolutionSwitch}
                  onSwitchMirror={onSwitchMirror}
                  onClose={() => setOpenMenu('none')}
                />
              )}

              {openMenu === 'subtitles' && (
                <SubtitlesPopover
                  subtitles={media.subtitles}
                  activeSubtitleId={activeSubtitleId}
                  onSelectSubtitleId={onSelectSubtitleId}
                  subFontSize={subFontSize}
                  onSubFontSizeChange={setSubFontSize}
                  subtitleOffset={subtitleOffset}
                  onSubtitleOffsetChange={onSubtitleOffsetChange}
                  onUploadSubtitleFile={onUploadSubtitleFile}
                  onDownloadActiveSubtitle={handleDownloadActiveSubtitle}
                />
              )}

              {openMenu === 'download' && !isOfflineLocal && (
                <OfflineDownloadPopover
                  resolution={resolution}
                  onResolutionChange={onResolutionChange}
                  onSaveToDevice={() => {
                    onSaveToDevice(media, resolution);
                    setOpenMenu('none');
                  }}
                  onSaveToVault={() => {
                    onSaveToOfflineVault(media, resolution);
                    setOpenMenu('none');
                  }}
                  vaultSavingProgress={vaultSavingProgress}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#12151C] px-5 py-4">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-lg font-semibold text-white">{media.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>{isOfflineLocal ? 'Permanent Offline File' : media.sourceKind.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>{media.formatLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {resolution === 'original' ? media.nativeResolution || 'Original' : `Transcoded ${resolution}`}
            </span>
            {media.fileSize ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(media.fileSize)}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{media.subtitles.length} Subtitle Tracks</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {vaultSavingProgress !== null && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-mono text-amber-300 tabular-nums">
              <span>Caching Offline: {vaultSavingProgress.toFixed(0)}%</span>
            </div>
          )}

          {!isOfflineLocal && (
            <>
              <button
                type="button"
                onClick={() => onSaveToDevice(media, resolution)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#181C25] hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-amber-400" />
                Save to Device ({resolution})
              </button>

              <button
                type="button"
                disabled={vaultSavingProgress !== null}
                onClick={() => onSaveToOfflineVault(media, resolution)}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
              >
                <HardDriveDownload className="h-3.5 w-3.5" />
                Save Offline ({resolution})
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
