import { Film, Magnet, Play } from 'lucide-react';
import type { PlayableMediaItem } from '../types/media.ts';
import { formatDuration } from '../utils/formatters.ts';

interface OpenArchiveSectionProps {
  items: PlayableMediaItem[];
  onPlayMirror: (item: PlayableMediaItem) => void;
  onStreamMagnet: (magnetUri: string) => void;
  loadingMagnetId: string | null;
}

export function OpenArchiveSection({
  items,
  onPlayMirror,
  onStreamMagnet,
  loadingMagnetId,
}: OpenArchiveSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Open Cinema Archive</h2>
          <p className="text-sm text-slate-400">
            Instant-play Creative Commons masters with mirror failover, magnet peers, and international subtitle tracks.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map((item) => {
          const isMagnetLoading = loadingMagnetId === item.id;
          return (
            <article
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#12151C] transition-colors hover:border-white/20"
            >
              <div className="relative aspect-video overflow-hidden bg-[#181C25]">
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
                    <Film className="h-10 w-10 text-slate-600" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-slate-200 font-mono tabular-nums">
                  <span>{item.nativeResolution || '1080p'}</span>
                  <span>{formatDuration(item.duration)}</span>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span>{item.formatLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.mirrors?.length || 1} Mirrors</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.subtitles.length} Languages</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400 pt-1">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onPlayMirror(item)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Play Mirror
                  </button>
                  {item.magnetURI && (
                    <button
                      type="button"
                      disabled={isMagnetLoading}
                      onClick={() => onStreamMagnet(item.magnetURI!)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#181C25] hover:bg-white/10 px-3 py-2 text-xs font-medium text-slate-200 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                      title="Load via BitTorrent Magnet URI"
                    >
                      <Magnet className="h-3.5 w-3.5 text-amber-400" />
                      {isMagnetLoading ? 'Connecting...' : 'Magnet'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
