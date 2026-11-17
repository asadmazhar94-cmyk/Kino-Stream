import { execFile, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { EmbeddedSubtitleInfo, MediaProbeInfo, ResolutionOption } from '../src/types/media.ts';
import { resolveLanguageLabel } from './subtitleUtils.ts';

const VIDEO_EXTS = new Set([
  '.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi', '.wmv',
  '.flv', '.ts', '.m2ts', '.mpg', '.mpeg', '.ogv', '.3gp', '.vob',
]);

const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.opus', '.wma',
]);

const SUBTITLE_EXTS = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);

const NATIVE_VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.ogv']);
const NATIVE_AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.opus']);

export function classifyFile(filename: string): {
  extension: string;
  category: 'video' | 'audio' | 'subtitle' | 'other';
  nativePlayable: boolean;
  mimeType: string;
} {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.ogv': 'video/ogg',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.ts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
    '.3gp': 'video/3gpp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.opus': 'audio/opus',
    '.srt': 'text/plain; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
    '.ass': 'text/plain; charset=utf-8',
    '.ssa': 'text/plain; charset=utf-8',
    '.sub': 'text/plain; charset=utf-8',
  };

  if (VIDEO_EXTS.has(ext)) {
    return {
      extension: ext,
      category: 'video',
      nativePlayable: NATIVE_VIDEO_EXTS.has(ext),
      mimeType: mimeMap[ext] || 'video/mp4',
    };
  }
  if (AUDIO_EXTS.has(ext)) {
    return {
      extension: ext,
      category: 'audio',
      nativePlayable: NATIVE_AUDIO_EXTS.has(ext),
      mimeType: mimeMap[ext] || 'audio/mpeg',
    };
  }
  if (SUBTITLE_EXTS.has(ext)) {
    return {
      extension: ext,
      category: 'subtitle',
      nativePlayable: false,
      mimeType: mimeMap[ext] || 'text/plain; charset=utf-8',
    };
  }
  return {
    extension: ext,
    category: 'other',
    nativePlayable: false,
    mimeType: 'application/octet-stream',
  };
}

export function probeMedia(inputSource: string): Promise<MediaProbeInfo | null> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputSource,
      ],
      { timeout: 12000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const streams: Array<Record<string, unknown>> = parsed.streams || [];
          const format: Record<string, unknown> = parsed.format || {};

          const videoStream = streams.find((s) => s.codec_type === 'video');
          const audioStream = streams.find((s) => s.codec_type === 'audio');
          const subStreams = streams.filter((s) => s.codec_type === 'subtitle');

          const embeddedSubtitles: EmbeddedSubtitleInfo[] = subStreams.map((s, idx) => {
            const tags = (s.tags as Record<string, string>) || {};
            const langRaw = tags.language || tags.LANGUAGE || 'und';
            const langResolved = resolveLanguageLabel(langRaw);
            return {
              streamIndex: idx,
              language: langResolved.code,
              title: tags.title || langResolved.label || `Subtitle ${idx + 1}`,
              codec: String(s.codec_name || 'subrip'),
            };
          });

          const duration = Number(format.duration || (videoStream?.duration as string) || 0);
          const width = Number(videoStream?.width || 0);
          const height = Number(videoStream?.height || 0);
          const bitrate = Number(format.bit_rate || 0);

          resolve({
            duration: Number.isFinite(duration) ? duration : 0,
            width,
            height,
            videoCodec: String(videoStream?.codec_name || ''),
            audioCodec: String(audioStream?.codec_name || ''),
            formatName: String(format.format_name || ''),
            bitrate: Number.isFinite(bitrate) ? bitrate : 0,
            embeddedSubtitles,
          });
        } catch {
          resolve(null);
        }
      },
    );
  });
}

export function extractEmbeddedSubtitleVtt(inputSource: string, subtitleStreamIndex: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-i', inputSource,
      '-map', `0:s:${subtitleStreamIndex}`,
      '-f', 'webvtt',
      'pipe:1',
    ]);

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } else {
        const errMsg = Buffer.concat(errChunks).toString('utf8') || 'Failed to extract embedded subtitle track';
        reject(new Error(errMsg));
      }
    });

    proc.on('error', reject);
  });
}

function getScaleFilter(resolution: ResolutionOption): string | null {
  switch (resolution) {
    case '1080p':
      return "scale=-2:'min(1080,ih)'";
    case '720p':
      return "scale=-2:'min(720,ih)'";
    case '480p':
      return "scale=-2:'min(480,ih)'";
    case '360p':
      return "scale=-2:'min(360,ih)'";
    default:
      return null;
  }
}

export function spawnFfmpegStream(options: {
  inputUrlOrPipe: string | Readable;
  resolution: ResolutionOption;
  startTimeSeconds?: number;
  isDownload?: boolean;
}): { proc: ChildProcess; outputStream: Readable } {
  const args: string[] = ['-hide_banner', '-loglevel', 'error'];
  const isPipeInput = typeof options.inputUrlOrPipe !== 'string';

  if (options.startTimeSeconds && options.startTimeSeconds > 0 && !isPipeInput) {
    args.push('-ss', String(options.startTimeSeconds));
  }

  if (!isPipeInput) {
    const inputStr = options.inputUrlOrPipe as string;
    if (inputStr.startsWith('http://') || inputStr.startsWith('https://')) {
      args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4');
    }
    args.push('-i', inputStr);
  } else {
    args.push('-i', 'pipe:0');
    if (options.startTimeSeconds && options.startTimeSeconds > 0) {
      args.push('-ss', String(options.startTimeSeconds));
    }
  }

  const scaleFilter = getScaleFilter(options.resolution);
  if (scaleFilter) {
    args.push('-vf', scaleFilter);
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', options.isDownload ? 'veryfast' : 'ultrafast',
    '-crf', options.resolution === '360p' ? '26' : options.resolution === '480p' ? '24' : '22',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
  );

  if (!options.isDownload) {
    args.push('-tune', 'zerolatency');
  }

  args.push(
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  );

  const proc = spawn('ffmpeg', args, { stdio: [isPipeInput ? 'pipe' : 'ignore', 'pipe', 'pipe'] });

  if (isPipeInput && proc.stdin) {
    const readable = options.inputUrlOrPipe as Readable;
    readable.pipe(proc.stdin);
    proc.stdin.on('error', () => {
      // Ignore EPIPE when client cancels stream early
    });
    readable.on('error', () => {
      proc.kill('SIGKILL');
    });
  }

  return { proc, outputStream: proc.stdout! };
}
