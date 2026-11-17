import type { IndexerKind, TorrentIndexerSite, TorrentSearchResult } from '../src/types/media.ts';

function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTagText(block: string, tagName: string): string {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

function extractAttr(tag: string, attrName: string): string {
  const re = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
  const m = tag.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

function parseSizeString(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw || '').trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  const m = text.match(/([\d.]+)\s*(TB|GB|MB|KB|B|TiB|GiB|MiB|KiB)/i);
  if (!m) return undefined;
  const num = Number(m[1]);
  const unit = m[2].toUpperCase();
  const mult: Record<string, number> = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
  };
  return Math.round(num * (mult[unit] || 1));
}

export function buildSearchUrl(site: TorrentIndexerSite, query: string): string {
  const trimmed = site.urlTemplate.trim();
  const encoded = encodeURIComponent(query.trim());
  let url = trimmed.includes('{query}')
    ? trimmed.replace(/\{query\}/g, encoded)
    : trimmed;

  if (site.apiKey) {
    if (url.includes('{apikey}')) {
      url = url.replace(/\{apikey\}/g, encodeURIComponent(site.apiKey));
    } else if (!url.toLowerCase().includes('apikey=')) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}apikey=${encodeURIComponent(site.apiKey)}`;
    }
  }
  return url;
}

function parseTorznabOrRss(
  xml: string,
  site: TorrentIndexerSite,
  baseUrl: string,
): TorrentSearchResult[] {
  const results: TorrentSearchResult[] = [];
  const itemMatches = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];

  for (let i = 0; i < itemMatches.length; i += 1) {
    const block = itemMatches[i];
    const title = extractTagText(block, 'title');
    if (!title) continue;

    const link = extractTagText(block, 'link') || extractAttr(block.match(/<link[^>]+>/i)?.[0] || '', 'href');
    const pubDate = extractTagText(block, 'pubDate') || extractTagText(block, 'updated') || extractTagText(block, 'published');
    const category = extractTagText(block, 'category') || undefined;

    let magnetUri: string | undefined;
    let torrentUrl: string | undefined;
    let sizeBytes: number | undefined;
    let seeders: number | undefined;
    let leechers: number | undefined;

    // Look for inline magnet links anywhere in the item block
    const magnetMatch = block.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/i);
    if (magnetMatch) {
      magnetUri = decodeXmlEntities(magnetMatch[0]);
    }

    // Check <enclosure ... />
    const enclosureTag = block.match(/<enclosure[^>]+>/i)?.[0];
    if (enclosureTag) {
      const encUrl = extractAttr(enclosureTag, 'url');
      const encType = extractAttr(enclosureTag, 'type').toLowerCase();
      const encLen = Number(extractAttr(enclosureTag, 'length') || 0);
      if (encLen > 0) sizeBytes = encLen;
      if (encUrl.startsWith('magnet:')) {
        magnetUri = encUrl;
      } else if (encUrl && (encType.includes('torrent') || encUrl.toLowerCase().includes('.torrent'))) {
        torrentUrl = new URL(encUrl, baseUrl).toString();
      } else if (encUrl && !torrentUrl) {
        torrentUrl = new URL(encUrl, baseUrl).toString();
      }
    }

    // Check <torznab:attr name="..." value="..." />
    const attrTags = block.match(/<(?:torznab|newznab):attr[^>]+>/gi) || [];
    for (const tag of attrTags) {
      const name = extractAttr(tag, 'name').toLowerCase();
      const value = extractAttr(tag, 'value');
      if (name === 'magneturl' && value.startsWith('magnet:')) magnetUri = value;
      if (name === 'size') sizeBytes = parseSizeString(value) ?? sizeBytes;
      if (name === 'seeders') seeders = Number(value);
      if (name === 'peers' || name === 'leechers') leechers = Number(value);
    }

    if (!torrentUrl && link && (link.toLowerCase().includes('.torrent') || link.includes('download'))) {
      try {
        torrentUrl = new URL(link, baseUrl).toString();
      } catch {
        // ignore invalid link
      }
    }

    if (!magnetUri && link.startsWith('magnet:')) {
      magnetUri = link;
    }

    const rawSizeTag = extractTagText(block, 'size');
    if (!sizeBytes && rawSizeTag) {
      sizeBytes = parseSizeString(rawSizeTag);
    }

    results.push({
      id: `${site.id}-${i}-${title.slice(0, 16)}`,
      title,
      siteId: site.id,
      siteName: site.name,
      sizeBytes,
      seeders: Number.isFinite(seeders) ? seeders : undefined,
      leechers: Number.isFinite(leechers) ? leechers : undefined,
      publishedAt: pubDate || undefined,
      magnetUri,
      torrentUrl,
      infoUrl: link && !link.startsWith('magnet:') ? link : undefined,
      category,
    });
  }

  return results;
}

function parseArchiveOrgJson(jsonText: string, site: TorrentIndexerSite): TorrentSearchResult[] {
  const data = JSON.parse(jsonText);
  const docs: Array<Record<string, unknown>> = data?.response?.docs || [];
  return docs
    .filter((doc) => typeof doc.identifier === 'string')
    .map((doc, idx) => {
      const identifier = String(doc.identifier);
      const title = String(doc.title || identifier);
      const sizeBytes = parseSizeString(doc.item_size);
      const downloads = Number(doc.downloads || 0);
      return {
        id: `${site.id}-${identifier}-${idx}`,
        title,
        siteId: site.id,
        siteName: site.name,
        sizeBytes,
        seeders: downloads > 0 ? Math.max(1, Math.min(999, Math.round(downloads / 50))) : undefined,
        publishedAt: doc.publicdate ? String(doc.publicdate).slice(0, 10) : undefined,
        torrentUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(identifier)}_archive.torrent`,
        infoUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
        category: doc.mediatype ? String(doc.mediatype) : 'Public Archive',
        archiveIdentifier: identifier,
      };
    });
}

function parseGenericJson(jsonText: string, site: TorrentIndexerSite, baseUrl: string): TorrentSearchResult[] {
  const parsed = JSON.parse(jsonText);
  if (parsed?.response?.docs && Array.isArray(parsed.response.docs)) {
    return parseArchiveOrgJson(jsonText, site);
  }

  const arr: Array<Record<string, unknown>> = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.results)
      ? parsed.results
      : Array.isArray(parsed?.Results)
        ? parsed.Results
        : Array.isArray(parsed?.data)
          ? parsed.data
          : Array.isArray(parsed?.items)
            ? parsed.items
            : [];

  return arr
    .map((row, idx): TorrentSearchResult | null => {
      const title = String(row.title || row.Title || row.name || row.Name || '').trim();
      if (!title) return null;

      const rawMagnet = String(row.magnetUri || row.magnet || row.MagnetUri || row.magnet_link || '').trim();
      const rawTorrent = String(row.torrentUrl || row.torrent || row.Link || row.downloadUrl || row.link || '').trim();
      const rawInfo = String(row.infoUrl || row.Details || row.details || row.url || '').trim();
      const rawMirror = String(row.mirrorUrl || row.streamUrl || '').trim();

      let torrentUrl: string | undefined;
      if (rawTorrent && !rawTorrent.startsWith('magnet:')) {
        try {
          torrentUrl = new URL(rawTorrent, baseUrl).toString();
        } catch {
          torrentUrl = rawTorrent;
        }
      }

      return {
        id: `${site.id}-${idx}-${title.slice(0, 16)}`,
        title,
        siteId: site.id,
        siteName: site.name,
        sizeBytes: parseSizeString(row.sizeBytes ?? row.size ?? row.Size),
        seeders: row.seeders !== undefined || row.Seeders !== undefined || row.seeds !== undefined
          ? Number(row.seeders ?? row.Seeders ?? row.seeds)
          : undefined,
        leechers: row.leechers !== undefined || row.Peers !== undefined
          ? Number(row.leechers ?? row.Peers)
          : undefined,
        publishedAt: row.publishedAt || row.PublishDate ? String(row.publishedAt || row.PublishDate) : undefined,
        magnetUri: rawMagnet.startsWith('magnet:') ? rawMagnet : rawTorrent.startsWith('magnet:') ? rawTorrent : undefined,
        torrentUrl,
        mirrorUrl: rawMirror || undefined,
        infoUrl: rawInfo || undefined,
        category: row.category || row.CategoryDesc ? String(row.category || row.CategoryDesc) : undefined,
      };
    })
    .filter((item): item is TorrentSearchResult => item !== null);
}

function stripTags(html: string): string {
  return decodeXmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseHtmlLinks(html: string, site: TorrentIndexerSite, baseUrl: string): TorrentSearchResult[] {
  const results: TorrentSearchResult[] = [];
  const seenUrls = new Set<string>();

  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = decodeXmlEntities(match[1]);
    const innerText = stripTags(match[2]);

    const isMagnet = href.startsWith('magnet:');
    const isTorrentLink = /\.torrent(\?|$)/i.test(href);
    if (!isMagnet && !isTorrentLink) continue;

    let resolvedUrl = href;
    if (!isMagnet) {
      try {
        resolvedUrl = new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }

    if (seenUrls.has(resolvedUrl)) continue;
    seenUrls.add(resolvedUrl);

    let title = innerText;
    if (isMagnet) {
      const dnMatch = href.match(/[?&]dn=([^&]+)/i);
      if (dnMatch) {
        try {
          title = decodeURIComponent(dnMatch[1].replace(/\+/g, ' '));
        } catch {
          // keep innerText
        }
      }
    }
    if (!title || /^(magnet|download|torrent|\.torrent)$/i.test(title)) {
      const snippet = html.slice(Math.max(0, match.index - 220), match.index);
      const heading = snippet.match(/<(?:td|div|span|h\d|a)[^>]*>([^<]{5,120})<\/(?:td|div|span|h\d|a)>/gi);
      if (heading && heading.length > 0) {
        title = stripTags(heading[heading.length - 1]);
      }
    }
    if (!title) {
      title = isMagnet ? 'Magnet Stream' : resolvedUrl.split('/').pop() || 'Torrent File';
    }

    results.push({
      id: `${site.id}-${results.length}`,
      title,
      siteId: site.id,
      siteName: site.name,
      magnetUri: isMagnet ? resolvedUrl : undefined,
      torrentUrl: !isMagnet ? resolvedUrl : undefined,
      category: isMagnet ? 'Magnet' : 'Torrent',
    });

    if (results.length >= 60) break;
  }

  return results;
}

export async function searchIndexerSite(
  site: TorrentIndexerSite,
  query: string,
): Promise<{ results: TorrentSearchResult[]; detectedKind: IndexerKind; error?: string }> {
  const url = buildSearchUrl(site, query);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'KinoStream/1.0 (+https://kinostream.app)',
        Accept: 'application/json, application/rss+xml, application/xml, text/xml, text/html, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
      return {
        results: [],
        detectedKind: site.kind,
        error: `HTTP ${resp.status} from ${site.name}`,
      };
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const body = await resp.text();
    const trimmed = body.trim();

    let kind: IndexerKind = site.kind;
    if (kind === 'auto') {
      if (trimmed.startsWith('{') || trimmed.startsWith('[') || contentType.includes('json')) {
        kind = url.includes('archive.org/advancedsearch') ? 'archive-org' : 'json-api';
      } else if (
        trimmed.startsWith('<?xml') ||
        trimmed.includes('<rss') ||
        trimmed.includes('<feed') ||
        contentType.includes('xml')
      ) {
        kind = 'torznab-rss';
      } else {
        kind = 'html-links';
      }
    }

    if (kind === 'archive-org') {
      return { results: parseArchiveOrgJson(body, site), detectedKind: 'archive-org' };
    }
    if (kind === 'json-api') {
      return { results: parseGenericJson(body, site, url), detectedKind: 'json-api' };
    }
    if (kind === 'torznab-rss') {
      return { results: parseTorznabOrRss(body, site, url), detectedKind: 'torznab-rss' };
    }
    return { results: parseHtmlLinks(body, site, url), detectedKind: 'html-links' };
  } catch (err) {
    return {
      results: [],
      detectedKind: site.kind,
      error: err instanceof Error ? err.message : 'Failed to query torrent site',
    };
  }
}

export async function resolveSearchResultPlayable(result: TorrentSearchResult): Promise<{
  magnetUri?: string;
  torrentUrl?: string;
  mirrorUrl?: string;
}> {
  if (result.archiveIdentifier) {
    try {
      const metaResp = await fetch(
        `https://archive.org/metadata/${encodeURIComponent(result.archiveIdentifier)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (metaResp.ok) {
        const meta = await metaResp.json();
        const files: Array<{ name?: string; format?: string }> = meta?.files || [];
        const torrentFile = files.find((f) => String(f.name || '').endsWith('.torrent'));
        const mp4File =
          files.find((f) => String(f.name || '').toLowerCase().endsWith('.mp4')) ||
          files.find((f) => /\.(mkv|webm|mov|ogv|mp3|flac)$/i.test(String(f.name || '')));

        const base = `https://archive.org/download/${encodeURIComponent(result.archiveIdentifier)}`;
        return {
          torrentUrl: torrentFile?.name
            ? `${base}/${encodeURIComponent(torrentFile.name)}`
            : result.torrentUrl,
          mirrorUrl: mp4File?.name
            ? `${base}/${encodeURIComponent(mp4File.name)}`
            : result.mirrorUrl,
          magnetUri: result.magnetUri,
        };
      }
    } catch {
      // fall through
    }
  }

  if (!result.magnetUri && !result.torrentUrl && result.infoUrl) {
    try {
      const resp = await fetch(result.infoUrl, {
        headers: { 'User-Agent': 'KinoStream/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const html = await resp.text();
        const magMatch = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^"'<\s]*/i);
        const torMatch = html.match(/href=["']([^"']+\.torrent(?:\?[^"']*)?)["']/i);
        return {
          magnetUri: magMatch ? decodeXmlEntities(magMatch[0]) : undefined,
          torrentUrl: torMatch ? new URL(decodeXmlEntities(torMatch[1]), result.infoUrl).toString() : undefined,
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    magnetUri: result.magnetUri,
    torrentUrl: result.torrentUrl,
    mirrorUrl: result.mirrorUrl,
  };
}
