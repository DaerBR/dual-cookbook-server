import { getEnv } from './env';

const DEFAULT_ALLOWED = ['13daer@gmail.com', 'i.s.gavrylenko@gmail.com'] as const;

/**
 * Returns lowercased allowed Google account emails (family whitelist).
 */
export function getAllowedEmails(): string[] {
  const raw = getEnv().ALLOWED_EMAILS;
  if (!raw?.trim()) {
    return [...DEFAULT_ALLOWED];
  }
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | undefined): boolean {
  if (!email) {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  return getAllowedEmails().includes(normalized);
}
