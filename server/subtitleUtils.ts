const LANGUAGE_MAP: Record<string, { code: string; label: string }> = {
  en: { code: 'en', label: 'English' },
  eng: { code: 'en', label: 'English' },
  english: { code: 'en', label: 'English' },
  es: { code: 'es', label: 'Español' },
  spa: { code: 'es', label: 'Español' },
  spanish: { code: 'es', label: 'Español' },
  fr: { code: 'fr', label: 'Français' },
  fre: { code: 'fr', label: 'Français' },
  fra: { code: 'fr', label: 'Français' },
  french: { code: 'fr', label: 'Français' },
  de: { code: 'de', label: 'Deutsch' },
  ger: { code: 'de', label: 'Deutsch' },
  deu: { code: 'de', label: 'Deutsch' },
  german: { code: 'de', label: 'Deutsch' },
  ja: { code: 'ja', label: '日本語' },
  jp: { code: 'ja', label: '日本語' },
  jpn: { code: 'ja', label: '日本語' },
  japanese: { code: 'ja', label: '日本語' },
  ko: { code: 'ko', label: '한국어' },
  kor: { code: 'ko', label: '한국어' },
  korean: { code: 'ko', label: '한국어' },
  zh: { code: 'zh', label: '中文' },
  chi: { code: 'zh', label: '中文' },
  zho: { code: 'zh', label: '中文' },
  chs: { code: 'zh-Hans', label: '中文 (简体)' },
  cht: { code: 'zh-Hant', label: '中文 (繁體)' },
  ar: { code: 'ar', label: 'العربية' },
  ara: { code: 'ar', label: 'العربية' },
  arabic: { code: 'ar', label: 'العربية' },
  hi: { code: 'hi', label: 'हिन्दी' },
  hin: { code: 'hi', label: 'हिन्दी' },
  pt: { code: 'pt', label: 'Português' },
  por: { code: 'pt', label: 'Português' },
  ru: { code: 'ru', label: 'Русский' },
  rus: { code: 'ru', label: 'Русский' },
  it: { code: 'it', label: 'Italiano' },
  ita: { code: 'it', label: 'Italiano' },
  tr: { code: 'tr', label: 'Türkçe' },
  tur: { code: 'tr', label: 'Türkçe' },
  vi: { code: 'vi', label: 'Tiếng Việt' },
  vie: { code: 'vi', label: 'Tiếng Việt' },
  th: { code: 'th', label: 'ไทย' },
  tha: { code: 'th', label: 'ไทย' },
  pl: { code: 'pl', label: 'Polski' },
  pol: { code: 'pl', label: 'Polski' },
  nl: { code: 'nl', label: 'Nederlands' },
  dut: { code: 'nl', label: 'Nederlands' },
  nld: { code: 'nl', label: 'Nederlands' },
  sv: { code: 'sv', label: 'Svenska' },
  swe: { code: 'sv', label: 'Svenska' },
  fa: { code: 'fa', label: 'فارسی' },
  per: { code: 'fa', label: 'فارسی' },
  ur: { code: 'ur', label: 'اردو' },
  urd: { code: 'ur', label: 'اردو' },
};

export function detectLanguageFromFilename(filename: string): { code: string; label: string } {
  const cleaned = filename.toLowerCase().replace(/\.(srt|vtt|ass|ssa|sub)$/i, '');
  const tokens = cleaned.split(/[.\-_[\]()\s]+/).filter(Boolean);

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (LANGUAGE_MAP[token]) {
      return LANGUAGE_MAP[token];
    }
  }

  return { code: 'und', label: filename.replace(/\.(srt|vtt|ass|ssa|sub)$/i, '') };
}

export function resolveLanguageLabel(codeOrName: string): { code: string; label: string } {
  const key = codeOrName.trim().toLowerCase();
  if (LANGUAGE_MAP[key]) {
    return LANGUAGE_MAP[key];
  }
  return { code: key || 'und', label: codeOrName || 'Unknown' };
}

function padTwo(val: number): string {
  return String(Math.floor(val)).padStart(2, '0');
}

function padThree(val: number): string {
  return String(Math.floor(val)).padStart(3, '0');
}

function framesToVttTime(frames: number, fps = 23.976): string {
  const totalMs = Math.max(0, Math.round((frames / fps) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${padTwo(hours)}:${padTwo(mins)}:${padTwo(secs)}.${padThree(ms)}`;
}

function assTimeToVtt(raw: string): string {
  // H:MM:SS.cc -> HH:MM:SS.mmm
  const match = raw.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return '00:00:00.000';
  const hours = padTwo(Number(match[1]));
  const mins = match[2];
  const secs = match[3];
  const ms = padThree(Number(match[4]) * 10);
  return `${hours}:${mins}:${secs}.${ms}`;
}

export function convertToWebVtt(rawContent: string, formatHint = ''): string {
  const normalized = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) {
    return 'WEBVTT\n\n';
  }

  const lowerHint = formatHint.toLowerCase();

  // Already WebVTT
  if (normalized.startsWith('WEBVTT') || lowerHint.endsWith('vtt')) {
    const body = normalized.startsWith('WEBVTT') ? normalized : `WEBVTT\n\n${normalized}`;
    return body.endsWith('\n') ? body : `${body}\n`;
  }

  // ASS / SSA subtitle format
  if (
    lowerHint.endsWith('ass') ||
    lowerHint.endsWith('ssa') ||
    normalized.includes('[Script Info]') ||
    normalized.includes('Dialogue:')
  ) {
    const lines = normalized.split('\n');
    let formatCols = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
    const cues: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Format:') && trimmed.includes('Start') && trimmed.includes('Text')) {
        formatCols = trimmed
          .slice('Format:'.length)
          .split(',')
          .map((c) => c.trim());
      } else if (trimmed.startsWith('Dialogue:')) {
        const payload = trimmed.slice('Dialogue:'.length).trim();
        const startIdx = formatCols.indexOf('Start');
        const endIdx = formatCols.indexOf('End');
        const textIdx = formatCols.indexOf('Text');
        if (startIdx === -1 || endIdx === -1 || textIdx === -1) continue;

        const parts: string[] = [];
        let cursor = 0;
        for (let i = 0; i < formatCols.length - 1; i += 1) {
          const comma = payload.indexOf(',', cursor);
          if (comma === -1) break;
          parts.push(payload.slice(cursor, comma));
          cursor = comma + 1;
        }
        parts.push(payload.slice(cursor));

        if (parts.length > Math.max(startIdx, endIdx, textIdx)) {
          const start = assTimeToVtt(parts[startIdx]);
          const end = assTimeToVtt(parts[endIdx]);
          const text = parts[textIdx]
            .replace(/\{[^}]*\}/g, '')
            .replace(/\\N/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\h/g, ' ')
            .trim();

          if (text) {
            cues.push(`${start} --> ${end}\n${text}`);
          }
        }
      }
    }

    return `WEBVTT\n\n${cues.join('\n\n')}\n`;
  }

  // MicroDVD .sub format: {start}{end}Line1|Line2
  if (/^\{\d+\}\{\d+\}/.test(normalized)) {
    const cues: string[] = [];
    for (const line of normalized.split('\n')) {
      const m = line.trim().match(/^\{(\d+)\}\{(\d+)\}(.+)$/);
      if (!m) continue;
      const start = framesToVttTime(Number(m[1]));
      const end = framesToVttTime(Number(m[2]));
      const text = m[3].replace(/\{[^}]*\}/g, '').replace(/\|/g, '\n').trim();
      if (text) {
        cues.push(`${start} --> ${end}\n${text}`);
      }
    }
    return `WEBVTT\n\n${cues.join('\n\n')}\n`;
  }

  // Standard SRT format
  const blocks = normalized.split(/\n\s*\n/);
  const vttBlocks: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    if (lines.length === 0) continue;

    // Locate timestamp line
    let tsIndex = lines.findIndex((l) => l.includes('-->'));
    if (tsIndex === -1) continue;

    const tsLine = lines[tsIndex]
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .replace(/(\d{1}:\d{2}:\d{2}),(\d{3})/g, '0$1.$2');

    const textLines = lines
      .slice(tsIndex + 1)
      .join('\n')
      .replace(/<\/?font[^>]*>/gi, '')
      .trim();

    if (textLines) {
      vttBlocks.push(`${tsLine}\n${textLines}`);
    }
  }

  return `WEBVTT\n\n${vttBlocks.join('\n\n')}\n`;
}
