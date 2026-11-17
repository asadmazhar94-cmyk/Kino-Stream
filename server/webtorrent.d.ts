declare module 'webtorrent' {
  import type { EventEmitter } from 'node:events';
  import type { Readable } from 'node:stream';

  export interface TorrentFile {
    name: string;
    path: string;
    length: number;
    downloaded: number;
    progress: number;
    select(priority?: number): void;
    deselect(): void;
    createReadStream(opts?: { start?: number; end?: number }): Readable;
    arrayBuffer(): Promise<ArrayBuffer>;
  }

  export interface Torrent extends EventEmitter {
    infoHash: string;
    name: string;
    magnetURI: string;
    length: number;
    downloaded: number;
    uploaded: number;
    downloadSpeed: number;
    uploadSpeed: number;
    progress: number;
    numPeers: number;
    ready: boolean;
    path: string;
    files: TorrentFile[];
    destroy(opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void;
  }

  export default class WebTorrent extends EventEmitter {
    torrents: Torrent[];
    constructor(opts?: {
      maxConns?: number;
      dht?: boolean | object;
      lsd?: boolean;
      utp?: boolean;
      tracker?: boolean | object;
    });
    add(
      torrentId: string | Buffer,
      opts?: { path?: string; announce?: string[] },
      ontorrent?: (torrent: Torrent) => void,
    ): Torrent;
    get(torrentId: string | Buffer): Promise<Torrent | null>;
    remove(torrentId: string | Torrent, opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void;
    destroy(cb?: (err?: Error) => void): void;
  }
}
