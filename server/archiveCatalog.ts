import type { PlayableMediaItem } from '../src/types/media.ts';

export const ARCHIVE_CATALOG: PlayableMediaItem[] = [
  {
    id: 'archive-sintel',
    title: 'Sintel (Blender Open Movie)',
    sourceKind: 'archive',
    formatLabel: 'MP4 · H.264',
    nativePlayable: true,
    duration: 888,
    nativeResolution: '1080p',
    posterUrl: '/src/assets/images/archive_sintel_still_1794926430232.jpg',
    description:
      'A wandering warrior searches across frozen peaks for a lost companion in this landmark open-cinema fantasy short.',
    magnetURI:
      'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent',
    mirrors: [
      {
        label: 'WebTorrent HTTP Seed Mirror (MP4)',
        url: 'https://webtorrent.io/torrents/Sintel/Sintel.mp4',
      },
      {
        label: 'Blender Foundation Mirror (1080p MP4)',
        url: 'https://download.blender.org/durian/trailer/sintel_trailer-1080p.mp4',
      },
    ],
    activeMirrorIndex: 0,
    subtitles: [
      { id: 'sintel-en', language: 'en', label: 'English', source: 'archive', url: '/api/archive/subtitles/sintel/en' },
      { id: 'sintel-es', language: 'es', label: 'Español', source: 'archive', url: '/api/archive/subtitles/sintel/es' },
      { id: 'sintel-fr', language: 'fr', label: 'Français', source: 'archive', url: '/api/archive/subtitles/sintel/fr' },
      { id: 'sintel-ja', language: 'ja', label: '日本語', source: 'archive', url: '/api/archive/subtitles/sintel/ja' },
      { id: 'sintel-ar', language: 'ar', label: 'العربية', source: 'archive', url: '/api/archive/subtitles/sintel/ar' },
    ],
  },
  {
    id: 'archive-tears-of-steel',
    title: 'Tears of Steel',
    sourceKind: 'archive',
    formatLabel: 'MOV · H.264',
    nativePlayable: true,
    duration: 734,
    nativeResolution: '720p',
    posterUrl: '/src/assets/images/archive_steel_still_1794926431509.jpg',
    description:
      'Set in a rain-soaked future Amsterdam, scientists stage a tense confrontation inside an old rooftop observatory.',
    magnetURI:
      'magnet:?xt=urn:btih:209c8226b299b308beaf2b9cd3afb992d294f4c9&dn=Tears+of+Steel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F',
    mirrors: [
      {
        label: 'Blender Cloud Primary Mirror (720p MOV)',
        url: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov',
      },
      {
        label: 'W3C Mirror Fallback (MP4)',
        url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      },
    ],
    activeMirrorIndex: 0,
    subtitles: [
      { id: 'tos-en', language: 'en', label: 'English', source: 'archive', url: '/api/archive/subtitles/tos/en' },
      { id: 'tos-de', language: 'de', label: 'Deutsch', source: 'archive', url: '/api/archive/subtitles/tos/de' },
      { id: 'tos-es', language: 'es', label: 'Español', source: 'archive', url: '/api/archive/subtitles/tos/es' },
      { id: 'tos-ja', language: 'ja', label: '日本語', source: 'archive', url: '/api/archive/subtitles/tos/ja' },
    ],
  },
  {
    id: 'archive-big-buck-bunny',
    title: 'Big Buck Bunny',
    sourceKind: 'archive',
    formatLabel: 'MP4 · H.264',
    nativePlayable: true,
    duration: 33,
    nativeResolution: '720p',
    posterUrl: '/src/assets/images/archive_bunny_still_1794926431393.jpg',
    description:
      'A gentle woodland giant turns the tables on three forest bullies in this classic open-source animated featurette.',
    magnetURI:
      'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fbig-buck-bunny.torrent',
    mirrors: [
      {
        label: 'W3C Primary Mirror (MP4)',
        url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
      },
      {
        label: 'Blender Foundation Mirror (MP4)',
        url: 'https://download.blender.org/durian/trailer/sintel_trailer-1080p.mp4',
      },
    ],
    activeMirrorIndex: 0,
    subtitles: [
      { id: 'bbb-en', language: 'en', label: 'English', source: 'archive', url: '/api/archive/subtitles/bbb/en' },
      { id: 'bbb-fr', language: 'fr', label: 'Français', source: 'archive', url: '/api/archive/subtitles/bbb/fr' },
      { id: 'bbb-ar', language: 'ar', label: 'العربية', source: 'archive', url: '/api/archive/subtitles/bbb/ar' },
    ],
  },
];

const SUBTITLE_SCRIPTS: Record<string, Record<string, string>> = {
  sintel: {
    en: `WEBVTT

00:00:12.000 --> 00:00:17.500
A lone traveler crosses the frozen ridge, searching for what was lost.

00:00:24.000 --> 00:00:29.500
"Are you all right? You shouldn't be out here alone in this storm."

00:00:40.000 --> 00:00:46.000
"I've been looking for the land of the dragons. Have you heard of it?"

00:01:02.000 --> 00:01:08.500
High above the valley, ancient stone towers guard the memory of Scales.`,
    es: `WEBVTT

00:00:12.000 --> 00:00:17.500
Una viajera solitaria cruza la cresta helada, buscando lo que perdió.

00:00:24.000 --> 00:00:29.500
"—¿Estás bien? No deberías estar sola en medio de esta tormenta."

00:00:40.000 --> 00:00:46.000
"—He estado buscando la tierra de los dragones. ¿Has oído hablar de ella?"

00:01:02.000 --> 00:01:08.500
En lo alto del valle, antiguas torres de piedra custodian el recuerdo de Scales.`,
    fr: `WEBVTT

00:00:12.000 --> 00:00:17.500
Une voyageuse solitaire traverse la crête glacée, en quête de ce qu'elle a perdu.

00:00:24.000 --> 00:00:29.500
« Ça va ? Tu ne devrais pas être seule dehors dans cette tempête. »

00:00:40.000 --> 00:00:46.000
« Je cherche la terre des dragons. En as-tu déjà entendu parler ? »

00:01:02.000 --> 00:01:08.500
Au-dessus de la vallée, d'anciennes tours de pierre veillent sur le souvenir de Scales.`,
    ja: `WEBVTT

00:00:12.000 --> 00:00:17.500
孤独な旅人が、失われたものを求めて凍てつく尾根を越える。

00:00:24.000 --> 00:00:29.500
「大丈夫か？ こんな嵐の中、一人で出歩くべきじゃない。」

00:00:40.000 --> 00:00:46.000
「ドラゴンの棲む地を探しているの。聞いたことはある？」

00:01:02.000 --> 00:01:08.500
谷のはるか上方で、古代の石塔がスケイルズの記憶を守り続けている。`,
    ar: `WEBVTT

00:00:12.000 --> 00:00:17.500
تعبر مسافرة وحيدة القمة المتجمدة بحثاً عما فقدته.

00:00:24.000 --> 00:00:29.500
«هل أنتِ بخير؟ لا ينبغي أن تكوني وحدكِ في هذه العاصفة.»

00:00:40.000 --> 00:00:46.000
«كنت أبحث عن أرض التنانين. هل سمعتَ عنها من قبل؟»

00:01:02.000 --> 00:01:08.500
فوق الوادي المرتفع، تحرس الأبراج الحجرية القديمة ذكرى سكيلز.`,
  },
  tos: {
    en: `WEBVTT

00:00:06.000 --> 00:00:11.000
"You know, Celia, this whole time I thought it was about the rocket."

00:00:14.000 --> 00:00:19.000
"It was never about the rocket, Thom. It was about letting go."

00:00:26.000 --> 00:00:33.000
Forty years later, the Amsterdam observatory still hums beneath the rain.`,
    de: `WEBVTT

00:00:06.000 --> 00:00:11.000
„Weißt du, Celia, die ganze Zeit dachte ich, es ginge um die Rakete.“

00:00:14.000 --> 00:00:19.000
„Es ging nie um die Rakete, Thom. Es ging darum, loszulassen.“

00:00:26.000 --> 00:00:33.000
Vierzig Jahre später summt das Amsterdamer Observatorium noch immer im Regen.`,
    es: `WEBVTT

00:00:06.000 --> 00:00:11.000
«Sabes, Celia, todo este tiempo pensé que se trataba del cohete.»

00:00:14.000 --> 00:00:19.000
«Nunca fue por el cohete, Thom. Se trataba de aprender a soltar.»

00:00:26.000 --> 00:00:33.000
Cuarenta años después, el observatorio de Ámsterdam sigue zumbando bajo la lluvia.`,
    ja: `WEBVTT

00:00:06.000 --> 00:00:11.000
「なあセリア、ずっとロケットのことだと思っていたんだ。」

00:00:14.000 --> 00:00:19.000
「ロケットの問題じゃなかったのよ、トム。手放すことだったの。」

00:00:26.000 --> 00:00:33.000
四十年後、アムステルダムの天文台は今も雨の中で静かに稼働している。`,
  },
  bbb: {
    en: `WEBVTT

00:00:08.000 --> 00:00:14.000
Dawn breaks over a quiet meadow as the forest awakens.

00:00:20.000 --> 00:00:26.500
A giant rabbit emerges into the warm morning sunlight, admiring the butterflies.`,
    fr: `WEBVTT

00:00:08.000 --> 00:00:14.000
L'aube se lève sur une prairie paisible tandis que la forêt s'éveille.

00:00:20.000 --> 00:00:26.500
Un lapin géant s'avance dans la douce lumière du matin, admirant les papillons.`,
    ar: `WEBVTT

00:00:08.000 --> 00:00:14.000
يبزغ الفجر فوق مرج هادئ بينما تستيقظ الغابة.

00:00:20.000 --> 00:00:26.500
يخرج أرنب ضخم نحو أشعة الشمس الدافئة متأملاً الفراشات.`,
  },
};

export function getArchiveSubtitleVtt(slug: string, lang: string): string | null {
  return SUBTITLE_SCRIPTS[slug]?.[lang] || null;
}
