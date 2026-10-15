export const fetchHtml = async (url: URL): Promise<string> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'facebookexternalhit/1.1', 'Accept-Language': 'en-US' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Resource not found');
    }

    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('text/html')) {
    throw new Error(`Expected HTML but got ${contentType}`);
  }

  return await response.text();
};
