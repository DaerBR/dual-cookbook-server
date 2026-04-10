/**
 * Recursively renames `_id` → `id` (string) for API JSON so clients avoid `no-underscore-dangle`.
 * Use in Mongoose `toJSON` transforms and on `.lean()` results (lean skips schema transforms).
 */
export function renameMongoIdsForClient<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => renameMongoIdsForClient(item)) as T;
  }
  if (input instanceof Date || Buffer.isBuffer(input)) {
    return input;
  }
  if (typeof input === 'object') {
    const ctor = (input as object).constructor?.name;
    if (ctor === 'ObjectId' || ctor === 'ObjectID') {
      return String(input) as T;
    }
    if (Object.getPrototypeOf(input) === Object.prototype || ctor === 'Object') {
      const src = input as Record<string, unknown>;
      const dst: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(src)) {
        if (key === '__v') {
          continue;
        }
        if (key === '_id') {
          dst.id = toIdString(val);
          continue;
        }
        dst[key] = renameMongoIdsForClient(val);
      }
      return dst as T;
    }
  }
  return input;
}

const toIdString = (v: unknown): string => {
  if (v != null && typeof v === 'object' && typeof (v as { toString?: () => string }).toString === 'function') {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
};
