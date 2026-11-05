import { load } from 'cheerio';
import { z } from 'zod';
import { fetchHtml } from './fetchExternal';
import type { ExternalRecipeDraft } from './types';
import { HttpError } from '../../utils/httpError';

/** `m.` is the mobile site; `youtube-nocookie.com` serves privacy-enhanced embeds. */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const SHORT_LINK_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/** Video ids are always 11 characters of base64url. */
const VIDEO_ID_REGEX = /^[\w-]{11}$/;

/** Paths that carry the id as the second segment: `/live/<id>`, `/embed/<id>`, `/v/<id>`. */
const ID_IN_PATH_REGEX = /^\/(?:live|embed|v)\/([\w-]{11})(?:[/?#]|$)/;

const MAX_TITLE_LENGTH = 100;

/**
 * Only the fields we read from `ytInitialPlayerResponse`. It is YouTube's internal, undocumented
 * structure, so its shape is checked at runtime instead of trusted. Zod drops unknown keys.
 */
const playerResponseSchema = z.object({
  playabilityStatus: z
    .object({
      status: z.string(),
      reason: z.string().optional(),
    })
    .optional(),
  videoDetails: z
    .object({
      videoId: z.string(),
      title: z.string(),
      shortDescription: z.string().default(''),
      thumbnail: z
        .object({
          thumbnails: z.array(z.object({ url: z.string(), width: z.number().optional() })),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Extracts the 11-char video id from any common YouTube URL form:
 * `youtube.com/watch?v=<id>`, `m.youtube.com/watch?v=<id>`, `youtu.be/<id>`,
 * `youtube.com/live/<id>` and `youtube.com/embed/<id>`. Shorts (`/shorts/<id>`) are intentionally not supported.
 */
export const getYoutubeVideoId = (url: URL) => {
  if (!url) {
    return null;
  }

  let videoId: string | null | undefined;

  if (SHORT_LINK_HOSTS.has(url.hostname)) {
    videoId = url.pathname.split('/')[1];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    videoId = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(ID_IN_PATH_REGEX)?.[1];
  }

  if (!videoId || !VIDEO_ID_REGEX.test(videoId)) {
    return null;
  }

  return videoId;
};

/**
 * The watch page embeds the player data as `var ytInitialPlayerResponse = {...};` in a `<script>`.
 * It can be followed by more code in the same tag (e.g. `var meta = ...`), so we cut at the first
 * `;` that is followed by `var` or by the end of the script.
 */
const extractPlayerResponse = (html: string): unknown => {
  const $ = load(html);
  const marker = 'var ytInitialPlayerResponse = ';

  const scriptText = $('script')
    .toArray()
    .map((script) => $(script).text())
    .find((text) => text.includes(marker));

  const json = scriptText?.match(/var ytInitialPlayerResponse = (\{[\s\S]+?\});\s*(?:var\s|$)/)?.[1];

  if (!json) {
    throw new HttpError(502, 'Could not find video data on the YouTube page');
  }

  try {
    return JSON.parse(json);
  } catch {
    throw new HttpError(502, 'Could not read video data from the YouTube page');
  }
};

const pickLargestThumbnail = (thumbnails: Array<{ url: string; width?: number }> = []) =>
  thumbnails.reduce<{ url: string; width?: number } | undefined>(
    (largest, current) => ((current.width ?? 0) > (largest?.width ?? 0) ? current : largest),
    thumbnails[0],
  )?.url;

export const parseYoutubeVideo = async (url: URL): Promise<ExternalRecipeDraft> => {
  const videoId = getYoutubeVideoId(url);

  if (!videoId) {
    throw new HttpError(400, 'Not a supported YouTube video URL');
  }

  /** Every URL form (mobile, youtu.be...) is normalized to the desktop watch page. */
  const canonicalUrl = new URL('https://www.youtube.com/watch');
  canonicalUrl.searchParams.set('v', videoId);

  const html = await fetchHtml(canonicalUrl);
  const parsed = playerResponseSchema.safeParse(extractPlayerResponse(html));

  if (!parsed.success) {
    throw new HttpError(502, 'Unexpected YouTube page format');
  }

  const { playabilityStatus, videoDetails } = parsed.data;

  /** Like Instagram, YouTube answers 200 for missing videos — only the player data tells us. */
  if (!videoDetails) {
    const reason = playabilityStatus?.reason ?? 'unknown reason';

    if (playabilityStatus?.status === 'ERROR' || playabilityStatus?.status === 'UNPLAYABLE') {
      throw new HttpError(422, `YouTube video unavailable: ${reason}`);
    }

    /** E.g. `LOGIN_REQUIRED` with "Sign in to confirm you're not a bot" when YouTube blocks our IP. */
    throw new HttpError(502, `YouTube refused to serve the video: ${reason}`);
  }

  const description = videoDetails.shortDescription.trim();

  if (!description) {
    throw new HttpError(422, 'This YouTube video has no description');
  }

  return {
    recipeTitle: videoDetails.title.trim().slice(0, MAX_TITLE_LENGTH).trim() || undefined,
    steps: [description],
    imageUrl: pickLargestThumbnail(videoDetails.thumbnail?.thumbnails),
    sourceUrl: canonicalUrl.href,
  };
};
