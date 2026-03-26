type ParseIngredientsOk = { ok: true; value: string };
type ParseIngredientsErr = { ok: false; error: string };

export const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const isDuplicateKeyError = (err: unknown): boolean => {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
};

export const coerceOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numericValue = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (Number.isNaN(numericValue)) {
    return undefined;
  }
  return numericValue;
};

export const parseIngredientsField = (
  raw: unknown,
  opts: { required: boolean },
): ParseIngredientsOk | ParseIngredientsErr => {
  if (raw === undefined || raw === null) {
    if (opts.required) {
      return { ok: false, error: 'ingredients must be a string' };
    }
    return { ok: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'ingredients must be a string' };
  }
  return { ok: true, value: raw };
};
