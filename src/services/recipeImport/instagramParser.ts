import { load } from 'cheerio';
import { fetchHtml } from './fetchHtml';
import type { ExternalRecipeDraft } from './types';
import { HttpError } from '../../utils/httpError';

export const getInstagramShortcode = (url: URL) => {
  if (!url) {
    return null;
  }

  if (url.hostname !== 'www.instagram.com' && url.hostname !== 'instagram.com') {
    return null;
  }

  const regex = /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/;

  const shortcode = url.pathname.match(regex)?.[1];

  if (!shortcode) {
    return null;
  }

  return shortcode;
};

const MAX_TITLE_LENGTH = 100;

/**
 * Pulls the caption out of Instagram's og:description, which looks like:
 * `8,345 likes, 71 comments - username on October 2, 2026: "CAPTION".`
 * Returns `null` when there is no quoted caption (post without a caption).
 */
const extractCaption = (ogDescription: string): string | null => {
  const start = ogDescription.indexOf('"');
  const end = ogDescription.lastIndexOf('"');

  if (start === -1 || end <= start) {
    return null;
  }

  /** Instagram uses U+2028 (line separator) for some line breaks; normalize to `\n`. */
  const caption = ogDescription
    .slice(start + 1, end)
    .replace(/\u2028/g, '\n')
    .trim();

  return caption || null;
};

const extractTitle = (caption: string): string | undefined => {
  const firstLine = caption
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine?.slice(0, MAX_TITLE_LENGTH).trim();
};

export const parseInstagramPost = async (url: URL): Promise<ExternalRecipeDraft> => {
  const shortcode = getInstagramShortcode(url);

  if (!shortcode) {
    throw new HttpError(400, 'Not a supported Instagram post URL');
  }

  const canonicalUrl = new URL(`https://www.instagram.com/p/${shortcode}/`);
  const html = await fetchHtml(canonicalUrl);
  const $ = load(html);

  /** Instagram answers 200 even for missing/private posts — the absent og:description is the only signal. */
  const ogDescription = $('meta[property="og:description"]').attr('content');

  if (!ogDescription) {
    throw new HttpError(422, 'Instagram post not found or not public');
  }

  const caption = extractCaption(ogDescription);

  if (!caption) {
    throw new HttpError(422, 'This Instagram post has no caption');
  }

  return {
    recipeTitle: extractTitle(caption),
    steps: [caption],
    sourceUrl: canonicalUrl.href,
  };
};
