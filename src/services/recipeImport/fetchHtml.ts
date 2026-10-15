import { HttpError } from '../../utils/httpError';

export const fetchHtml = async (url: URL): Promise<string> => {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1', 'Accept-Language': 'en-US' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    /** `fetch` rejects only when there is no HTTP reply at all: timeout, DNS failure, connection refused/reset. */
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new HttpError(504, `Timed out fetching ${url.hostname}`);
    }

    throw new HttpError(502, `Could not reach ${url.hostname}`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new HttpError(422, `Page not found: ${url.href}`);
    }

    throw new HttpError(502, `${url.hostname} responded with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('text/html')) {
    throw new HttpError(502, `Expected HTML but got ${contentType}`);
  }

  return await response.text();
};
