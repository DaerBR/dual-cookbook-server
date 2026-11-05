import { getInstagramShortcode, parseInstagramPost } from './instagramParser';
import { getTelegraphPath, parseTelegraphPage } from './telegraphParser';
import type { ExternalRecipeParser } from './types';
import { getYoutubeVideoId, parseYoutubeVideo } from './youtubeParser';

const parsers: ExternalRecipeParser[] = [
  {
    name: 'Instagram',
    canHandle: (url) => getInstagramShortcode(url) !== null,
    parse: parseInstagramPost,
  },
  {
    name: 'Telegraph',
    canHandle: (url) => getTelegraphPath(url) !== null,
    parse: parseTelegraphPage,
  },
  {
    name: 'YouTube',
    canHandle: (url) => getYoutubeVideoId(url) !== null,
    parse: parseYoutubeVideo,
  },
];

export const supportedSourceNames = parsers.map((parser) => parser.name);

export const findRecipeParser = (url: URL): ExternalRecipeParser | undefined =>
  parsers.find((parser) => parser.canHandle(url));
