import { getEnv } from './env';

/** Parses `CORS_ORIGIN` (comma-separated exact origins) into a trimmed allowlist. */
export const getCorsOriginAllowlist = (): string[] => {
  const raw = getEnv().CORS_ORIGIN;
  if (!raw?.trim()) {
    return [];
  }
  return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
};
