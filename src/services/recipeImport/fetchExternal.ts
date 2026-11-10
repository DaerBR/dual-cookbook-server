import { assertPublicUrl } from './assertPublicUrl';
import { HttpError } from '../../utils/httpError';

const TIMEOUT_MS = 10_000;

/** Max redirects followed by `fetchPublicHtml` (each hop is re-checked by `assertPublicUrl`). */
const MAX_REDIRECTS = 5;

/** Max page size read by `fetchPublicHtml`; recipe pages are usually 0.2–1 MB. */
const MAX_HTML_BYTES = 5 * 1024 * 1024;

/** Identifies the importer honestly to arbitrary recipe sites. */
const RECIPE_BOT_USER_AGENT = 'Mozilla/5.0 (compatible; DualCookbookImporter/1.0)';

/** Sends the request, mapping "no HTTP reply at all" failures to `HttpError`s. */
const sendRequest = async (url: URL, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    /** `fetch` rejects only when there is no HTTP reply at all: timeout, DNS failure, connection refused/reset. */
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new HttpError(504, `Timed out fetching ${url.hostname}`);
    }

    throw new HttpError(502, `Could not reach ${url.hostname}`);
  }
};

/** Maps non-2xx statuses to `HttpError`s. */
const assertOk = (response: Response, url: URL) => {
  if (response.ok) {
    return;
  }

  if (response.status === 404) {
    throw new HttpError(422, `Page not found: ${url.href}`);
  }

  if (response.status === 429) {
    throw new HttpError(503, `${url.hostname} is rate-limiting requests, try again later`);
  }

  throw new HttpError(502, `${url.hostname} responded with status ${response.status}`);
};

/** Fetches `url` and maps network failures and non-2xx statuses to `HttpError`s. */
const fetchExternal = async (url: URL, headers: Record<string, string>): Promise<Response> => {
  const response = await sendRequest(url, { headers });

  assertOk(response, url);

  return response;
};

const assertContentType = (response: Response, expected: string) => {
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes(expected)) {
    throw new HttpError(502, `Expected ${expected} but got ${contentType}`);
  }
};

export const fetchHtml = async (url: URL): Promise<string> => {
  const response = await fetchExternal(url, {
    'User-Agent': 'facebookexternalhit/1.1',
    'Accept-Language': 'en-US',
  });

  assertContentType(response, 'text/html');

  return await response.text();
};

/** `headers` is for extra request headers, e.g. API keys (keep keys out of the URL so they never leak into error messages). */
export const fetchJson = async (url: URL, headers: Record<string, string> = {}): Promise<unknown> => {
  const response = await fetchExternal(url, { Accept: 'application/json', ...headers });

  assertContentType(response, 'application/json');

  return await response.json();
};

/** Reads the body as text, aborting once it exceeds `MAX_HTML_BYTES` (Content-Length can be absent or wrong). */
const readLimitedText = async (response: Response, url: URL): Promise<string> => {
  const tooLarge = () => new HttpError(502, `Page at ${url.hostname} is too large to import`);

  if (Number(response.headers.get('content-length')) > MAX_HTML_BYTES) {
    await response.body?.cancel();

    throw tooLarge();
  }

  if (!response.body) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of response.body) {
    size += chunk.byteLength;

    if (size > MAX_HTML_BYTES) {
      throw tooLarge();
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
};

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/**
 * Fetches HTML from an arbitrary, user-supplied URL (generic recipe parser).
 * Unlike `fetchHtml`, every hop — the initial URL and each redirect target — must pass `assertPublicUrl`,
 * so the server can't be pointed at localhost / private networks / cloud metadata; the body size is capped too.
 * Resolves with the HTML and the final URL after redirects.
 */
export const fetchPublicHtml = async (url: URL, redirectsLeft = MAX_REDIRECTS): Promise<{ html: string; url: URL }> => {
  await assertPublicUrl(url);

  const response = await sendRequest(url, {
    headers: {
      'User-Agent': RECIPE_BOT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'uk,en;q=0.8',
    },
    redirect: 'manual',
  });

  if (isRedirect(response.status)) {
    const location = response.headers.get('location');

    await response.body?.cancel();

    if (!location || redirectsLeft === 0) {
      throw new HttpError(502, `${url.hostname} redirected too many times or without a target`);
    }

    return fetchPublicHtml(new URL(location, url), redirectsLeft - 1);
  }

  assertOk(response, url);
  assertContentType(response, 'html');

  return { html: await readLimitedText(response, url), url };
};
