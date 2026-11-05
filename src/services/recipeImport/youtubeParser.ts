import { z } from 'zod';
import { fetchJson } from './fetchExternal';
import type { ExternalRecipeDraft } from './types';
import { getEnv } from '../../config/env';
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

const thumbnailSchema = z.object({ url: z.string(), width: z.number().optional() });

/**
 * Only the fields we read from the YouTube Data API `videos.list` response
 * (https://developers.google.com/youtube/v3/docs/videos/list). Zod drops unknown keys.
 */
const videosListResponseSchema = z.object({
  items: z.array(
    z.object({
      snippet: z.object({
        title: z.string(),
        description: z.string().default(''),
        /** Keyed by size name (`default`, `medium`, `high`, `standard`, `maxres`); not every size is always present. */
        thumbnails: z.record(z.string(), thumbnailSchema).default({}),
      }),
    }),
  ),
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

const pickLargestThumbnail = (thumbnails: Array<z.infer<typeof thumbnailSchema>>) =>
  thumbnails.reduce<z.infer<typeof thumbnailSchema> | undefined>(
    (largest, current) => ((current.width ?? 0) > (largest?.width ?? 0) ? current : largest),
    thumbnails[0],
  )?.url;

export const parseYoutubeVideo = async (url: URL): Promise<ExternalRecipeDraft> => {
  const videoId = getYoutubeVideoId(url);

  if (!videoId) {
    throw new HttpError(400, 'Not a supported YouTube video URL');
  }

  const apiKey = getEnv().YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new HttpError(503, 'YouTube import is not configured on the server');
  }

  const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  apiUrl.searchParams.set('part', 'snippet');
  apiUrl.searchParams.set('id', videoId);

  /** The key goes in a header, not `?key=`, so it never appears in a URL that might be logged or echoed in an error. */
  const parsed = videosListResponseSchema.safeParse(await fetchJson(apiUrl, { 'X-Goog-Api-Key': apiKey }));

  if (!parsed.success) {
    throw new HttpError(502, 'Unexpected YouTube API response format');
  }

  /** Missing and private videos are not errors for the API: it just returns an empty `items` list. */
  const snippet = parsed.data.items[0]?.snippet;

  if (!snippet) {
    throw new HttpError(422, 'YouTube video not found or not public');
  }

  const description = snippet.description.trim();

  if (!description) {
    throw new HttpError(422, 'This YouTube video has no description');
  }

  /** Every URL form (mobile, youtu.be...) is normalized to the desktop watch page. */
  const canonicalUrl = new URL('https://www.youtube.com/watch');
  canonicalUrl.searchParams.set('v', videoId);

  return {
    recipeTitle: snippet.title.trim().slice(0, MAX_TITLE_LENGTH).trim() || undefined,
    steps: [description],
    imageUrl: pickLargestThumbnail(Object.values(snippet.thumbnails)),
    sourceUrl: canonicalUrl.href,
  };
};
