import { load } from 'cheerio';
import { fetchHtml } from './fetchExternal';
import type { ExternalRecipeDraft } from './types';
import { cleanText } from './cleanText';
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

/** Legacy format: `8,345 likes, 71 comments - username on October 2, 2026: "CAPTION".` */
const LEGACY_PREFIX = /^[\d.,]+[KM]?\s+likes?,\s+[\d.,]+[KM]?\s+comments?\s+-[^"\n]*?:\s*"/;

/** Current format (since ~Nov 2026): `CAPTION - @username on October 2, 2026` (no quotes, no counters). */
const CURRENT_SUFFIX = /(?:^|\s+-\s+)@[\w.]+\s+on\s+[^\n]*$/;

/**
 * Pulls the caption out of Instagram's description meta (see the two formats above).
 * Returns `null` when the meta matches neither format or carries no caption.
 */
const extractCaption = (description: string): string | null => {
  let rawCaption: string;

  if (LEGACY_PREFIX.test(description)) {
    const start = description.indexOf('"');
    const end = description.lastIndexOf('"');

    rawCaption = end > start ? description.slice(start + 1, end) : '';
  } else if (CURRENT_SUFFIX.test(description)) {
    rawCaption = description.replace(CURRENT_SUFFIX, '');
  } else {
    return null;
  }

  /** Instagram uses U+2028 (line separator) for some line breaks; normalize to `\n`. */
  const caption = rawCaption.replace(/\u2028/g, '\n').trim();

  return caption || null;
};

const extractTitle = (caption: string): string | undefined => {
  const firstLine = caption
    .split('\n')
    // Clean before picking, so an emoji- or hashtag-only first line ("🔥🔥🔥", "#рецепт #вечеря") doesn't become the title
    .map(cleanText)
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

  /**
   * Instagram answers 200 even for missing/private/age-restricted posts — absent description metas are the only signal.
   * Check both metas and use the first one that actually yields a caption, in case one of them lacks it.
   */
  const descriptions = [
    $('meta[property="og:description"]').attr('content'),
    $('meta[name="description"]').attr('content'),
  ].filter((content): content is string => Boolean(content));

  if (descriptions.length === 0) {
    throw new HttpError(
      422,
      'Instagram post is unavailable. Check that it opens without logging in (not private or age-restricted)',
    );
  }

  const caption = descriptions.map(extractCaption).find((text) => text !== null);

  if (!caption) {
    throw new HttpError(422, 'This Instagram post has no caption');
  }

  return {
    recipeTitle: extractTitle(caption),
    steps: [caption],
    sourceUrl: canonicalUrl.href,
  };
};
