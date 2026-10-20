import { fetchJson } from './fetchExternal';
import type { ExternalRecipeDraft } from './types';
import { HttpError } from '../../utils/httpError';

/** graph.org is Telegraph's official mirror; both serve the same pages under the same paths. */
const TELEGRAPH_HOSTS = new Set(['telegra.ph', 'www.telegra.ph', 'graph.org', 'www.graph.org']);

const MAX_TITLE_LENGTH = 100;

/** Node of Telegraph's content tree: https://telegra.ph/api#Node */
type TelegraphNode = string | TelegraphElement;

interface TelegraphElement {
  attrs?: Record<string, string>;
  children?: TelegraphNode[];
  tag: string;
}

interface TelegraphPage {
  content?: TelegraphNode[];
  image_url?: string;
  title: string;
}

interface TelegraphApiResponse {
  error?: string;
  ok: boolean;
  result?: TelegraphPage;
}

/** Tags rendered as their own line(s) in the extracted text. */
const BLOCK_TAGS = new Set(['p', 'h3', 'h4', 'blockquote', 'aside', 'pre', 'figcaption', 'li']);

/** Media without text — dropped entirely (a `figure`'s caption is kept via `figcaption`). */
const SKIPPED_TAGS = new Set(['img', 'video', 'iframe']);

export const getTelegraphPath = (url: URL) => {
  if (!url || !TELEGRAPH_HOSTS.has(url.hostname)) {
    return null;
  }

  /** Article paths are a single segment, e.g. `/Some-Title-07-05`; this also rules out `/file/...` and `/api`. */
  const path = url.pathname.match(/^\/([^/]+)\/?$/)?.[1];

  if (!path || path === 'api') {
    return null;
  }

  return path;
};

const inlineText = (nodes: TelegraphNode[] = []): string =>
  nodes
    .map((node) => {
      if (typeof node === 'string') {
        return node;
      }

      if (node.tag === 'br') {
        return '\n';
      }

      if (SKIPPED_TAGS.has(node.tag)) {
        return '';
      }

      return inlineText(node.children);
    })
    .join('');

/** Flattens the content tree into text lines: one per block element, list items prefixed with a marker. */
const collectLines = (nodes: TelegraphNode[] = [], lines: string[] = []): string[] => {
  for (const node of nodes) {
    if (typeof node === 'string') {
      lines.push(node);
      continue;
    }

    if (node.tag === 'ul' || node.tag === 'ol') {
      node.children?.forEach((item, index) => {
        const marker = node.tag === 'ol' ? `${index + 1}.` : '-';

        lines.push(`${marker} ${inlineText(typeof item === 'string' ? [item] : item.children)}`);
      });
      continue;
    }

    if (BLOCK_TAGS.has(node.tag)) {
      lines.push(inlineText(node.children));
      continue;
    }

    /** Containers such as `figure` — recurse so a `figcaption` inside still contributes its text. */
    collectLines(node.children, lines);
  }

  return lines;
};

/** Trims each line (authors indent with runs of spaces) and collapses consecutive blank lines into one. */
const normalizeText = (lines: string[]): string =>
  lines
    .flatMap((line) => line.split('\n'))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const parseTelegraphPage = async (url: URL): Promise<ExternalRecipeDraft> => {
  const path = getTelegraphPath(url);

  if (!path) {
    throw new HttpError(400, 'Not a supported Telegraph article URL');
  }

  const apiUrl = new URL(`https://api.telegra.ph/getPage/${path}`);
  apiUrl.searchParams.set('return_content', 'true');

  /** The API answers 200 even for errors — `ok: false` with e.g. `error: "PAGE_NOT_FOUND"`. */
  const response = (await fetchJson(apiUrl)) as TelegraphApiResponse;

  if (!response.ok || !response.result) {
    if (response.error === 'PAGE_NOT_FOUND') {
      throw new HttpError(422, 'Telegraph article not found');
    }

    throw new HttpError(502, `Telegraph API error: ${response.error ?? 'unknown'}`);
  }

  const { title, image_url: imageUrl, content } = response.result;
  const text = normalizeText(collectLines(content));

  if (!text) {
    throw new HttpError(422, 'This Telegraph article has no text');
  }

  return {
    recipeTitle: title.trim().slice(0, MAX_TITLE_LENGTH).trim() || undefined,
    steps: [text],
    imageUrl,
    sourceUrl: `https://telegra.ph/${path}`,
  };
};
