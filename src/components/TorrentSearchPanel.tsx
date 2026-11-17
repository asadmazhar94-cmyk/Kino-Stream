import { useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  ListPlus,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { IndexerKind, TorrentIndexerSite, TorrentSearchResult } from '../types/media.ts';
import { formatBytes } from '../utils/formatters.ts';

interface SiteStatus {
  siteId: string;
  siteName: string;
  detectedKind: IndexerKind;
  count: number;
  error?: string;
}

interface TorrentSearchPanelProps {
  sites: TorrentIndexerSite[];
  onAddSite: (site: TorrentIndexerSite) => void;
  onToggleSite: (siteId: string) => void;
  onRemoveSite: (siteId: string) => void;
  onStreamResult: (result: TorrentSearchResult) => Promise<void>;
  onQueueResult: (result: TorrentSearchResult) => Promise<void>;
}

const PRESET_TEMPLATES: Array<{
  label: string;
  name: string;
  urlTemplate: string;
  kind: IndexerKind;
}> = [
  {
    label: 'Archive.org Movies',
    name: 'Internet Archive (Movies)',
    urlTemplate:
      'https://archive.org/advancedsearch.php?q={query}+AND+mediatype:movies&fl[]=identifier,title,item_size,downloads,publicdate,mediatype&rows=25&output=json',
    kind: 'archive-org',
  },
  {
    label: 'Archive.org Audio',
    name: 'Internet Archive (Audio)',
    urlTemplate:
      'https://archive.org/advancedsearch.php?q={query}+AND+mediatype:audio&fl[]=identifier,title,item_size,downloads,publicdate,mediatype&rows=25&output=json',
    kind: 'archive-org',
  },
  {
    label: 'Torznab / Jackett',
    name: 'Custom Torznab Indexer',
    urlTemplate: 'https://your-jackett-host/api/v2.0/indexers/all/results/torznab?t=search&q={query}',
    kind: 'torznab-rss',
  },
];

export function TorrentSearchPanel({
  sites,
  onAddSite,
  onToggleSite,
  onRemoveSite,
  onStreamResult,
  onQueueResult,
}: TorrentSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<TorrentSearchResult[]>([]);
  const [siteStatuses, setSiteStatuses] = useState<SiteStatus[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyResultId, setBusyResultId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add Torrent Site form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [siteKind, setSiteKind] = useState<IndexerKind>('auto');
  const [siteApiKey, setSiteApiKey] = useState('');
  const [testOutcome, setTestOutcome] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const targetSites =
      selectedSiteFilter === 'all'
        ? sites
        : sites.map((s) => ({ ...s, enabled: s.id === selectedSiteFilter }));

    setIsSearching(true);
    setSearchError(null);
    try {
      const resp = await fetch('/api/indexers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), sites: targetSites }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results || []);
      setSiteStatuses(data.siteStatuses || []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Unable to search torrent sites');
    } finally {
      setIsSearching(false);
    }
  };

  const handleTestSite = async () => {
    if (!siteUrl.trim()) {
      setTestOutcome({ ok: false, message: 'Enter a site search URL template first.' });
      return;
    }
    setIsTesting(true);
    setTestOutcome(null);
    try {
      const draftSite: TorrentIndexerSite = {
        id: 'test-site',
        name: siteName.trim() || 'Test Site',
        urlTemplate: siteUrl.trim(),
        kind: siteKind,
        apiKey: siteApiKey.trim() || undefined,
        enabled: true,
        addedAt: Date.now(),
      };
      const resp = await fetch('/api/indexers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: draftSite, query: 'sintel' }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setTestOutcome({ ok: false, message: data.error || 'Connection test failed.' });
      } else {
        setTestOutcome({
          ok: true,
          message: `Connected (${data.detectedKind}) · ${data.count} results found${
            data.sampleTitles?.length ? ` (e.g. "${data.sampleTitles[0]}")` : ''
          }.`,
        });
      }
    } catch (err) {
      setTestOutcome({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to reach site',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCreateSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim() || !siteUrl.trim()) return;
    onAddSite({
      id: `site-${Date.now()}`,
      name: siteName.trim(),
      urlTemplate: siteUrl.trim(),
      kind: siteKind,
      apiKey: siteApiKey.trim() || undefined,
      enabled: true,
      addedAt: Date.now(),
    });
    setSiteName('');
    setSiteUrl('');
    setSiteApiKey('');
    setSiteKind('auto');
    setTestOutcome(null);
    setShowAddForm(false);
  };

  const copyMagnet = async (res: TorrentSearchResult) => {
    if (!res.magnetUri) return;
    await navigator.clipboard.writeText(res.magnetUri).catch(() => {});
    setCopiedId(res.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Torrent Site Search & Indexers</h2>
          <p className="text-sm text-slate-400">
            Add Torznab, RSS, JSON, or HTML torrent sites to search across sources and stream directly in the browser.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          {showAddForm ? 'Close Site Form' : 'Add Torrent Site'}
        </button>
      </div>

      {/* Add Custom Torrent Site Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateSite}
          className="rounded-xl border border-white/10 bg-[#12151C] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Configure Torrent Site / Indexer</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Templates:</span>
              {PRESET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setSiteName(tpl.name);
                    setSiteUrl(tpl.urlTemplate);
                    setSiteKind(tpl.kind);
                    setTestOutcome(null);
                  }}
                  className="rounded-md border border-white/10 bg-[#0B0D11] hover:bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 cursor-pointer"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <label className="block text-xs text-slate-300 mb-1">Site Name</label>
              <input
                type="text"
                required
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g., My Jackett Indexer"
                className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-5">
              <label className="block text-xs text-slate-300 mb-1">
                Search URL Template (use {'{query}'}) or RSS Feed URL
              </label>
              <input
                type="url"
                required
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://example.org/search?q={query}"
                className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs text-slate-300 mb-1">Parser Format</label>
              <select
                value={siteKind}
                onChange={(e) => setSiteKind(e.target.value as IndexerKind)}
                className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none cursor-pointer"
              >
                <option value="auto">Auto-Detect (Recommended)</option>
                <option value="torznab-rss">Torznab / RSS / Atom XML</option>
                <option value="json-api">JSON Search API</option>
                <option value="html-links">HTML Magnet / .torrent Extractor</option>
                <option value="archive-org">Archive.org API</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:w-72">
              <input
                type="password"
                value={siteApiKey}
                onChange={(e) => setSiteApiKey(e.target.value)}
                placeholder="Optional API Key (for Torznab / Jackett)"
                className="w-full rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestSite}
                className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-slate-200 disabled:opacity-50 cursor-pointer"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                Save Torrent Site
              </button>
            </div>
          </div>

          {testOutcome && (
            <div
              className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                testOutcome.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
              }`}
            >
              {testOutcome.message}
            </div>
          )}
        </form>
      )}

      {/* Configured Sites Strip */}
      <div className="rounded-xl border border-white/10 bg-[#12151C] p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1">Configured Sites:</span>
          {sites.map((site) => (
            <div
              key={site.id}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                site.enabled
                  ? 'border-amber-500/35 bg-amber-500/10 text-slate-100'
                  : 'border-white/10 bg-[#0B0D11] text-slate-400'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleSite(site.id)}
                className="inline-flex items-center gap-1.5 cursor-pointer"
                title={site.enabled ? 'Click to disable site in search' : 'Click to enable site'}
              >
                <Globe className={`h-3.5 w-3.5 ${site.enabled ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className="font-medium">{site.name}</span>
              </button>
              {!site.isPreset && (
                <button
                  type="button"
                  onClick={() => onRemoveSite(site.id)}
                  className="text-slate-400 hover:text-red-300 cursor-pointer"
                  aria-label={`Remove ${site.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search torrents across enabled sites (e.g., Sintel, Cosmos Laundromat, documentary)..."
              className="w-full rounded-lg border border-white/10 bg-[#0B0D11] pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <select
            value={selectedSiteFilter}
            onChange={(e) => setSelectedSiteFilter(e.target.value)}
            aria-label="Filter by torrent site"
            className="rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="all">All Enabled Sites ({sites.filter((s) => s.enabled).length})</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-45 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" />
            {isSearching ? 'Searching...' : 'Search Torrents'}
          </button>
        </form>

        {searchError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
            {searchError}
          </div>
        )}

        {siteStatuses.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-mono">
            {siteStatuses.map((st) => (
              <span key={st.siteId}>
                {st.siteName}: {st.error ? `Error (${st.error})` : `${st.count} results`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="rounded-xl border border-white/10 bg-[#12151C] overflow-hidden">
        {results.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-200">
              {siteStatuses.length > 0 ? 'No matching torrents found' : 'Search across your torrent sites'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {siteStatuses.length > 0
                ? 'Try a broader keyword or add another Torznab / RSS / HTML torrent indexer.'
                : 'Enter a title above to search Internet Archive Public Domain Cinema or any custom site you added.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#0B0D11]/60 text-[11px] font-medium text-slate-400">
                  <th className="px-4 py-2.5">Title & Source</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Size</th>
                  <th className="px-3 py-2.5 text-right">Seeders</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {results.map((res) => {
                  const isBusy = busyResultId === res.id;
                  return (
                    <tr key={res.id} className="h-11 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-2 max-w-md">
                        <p className="truncate font-medium text-slate-100">{res.title}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {res.siteName}
                          {res.publishedAt ? ` · ${res.publishedAt}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-300">
                        {res.category || 'Torrent'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200 tabular-nums whitespace-nowrap">
                        {res.sizeBytes ? formatBytes(res.sizeBytes) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                        {res.seeders !== undefined ? res.seeders : '—'}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyResultId(res.id);
                              try {
                                await onStreamResult(res);
                              } finally {
                                setBusyResultId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-2.5 py-1 text-[11px] font-semibold text-slate-950 cursor-pointer"
                          >
                            <Play className="h-3 w-3 fill-current" />
                            {isBusy ? 'Loading...' : 'Stream'}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyResultId(res.id);
                              try {
                                await onQueueResult(res);
                              } finally {
                                setBusyResultId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 px-2 py-1 text-[11px] text-slate-200 cursor-pointer"
                            title="Add to File Manager Queue"
                          >
                            <ListPlus className="h-3 w-3 text-amber-400" />
                            Queue
                          </button>

                          {res.magnetUri && (
                            <button
                              type="button"
                              onClick={() => copyMagnet(res)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                              title="Copy Magnet URI"
                              aria-label="Copy magnet link"
                            >
                              {copiedId === res.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
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
