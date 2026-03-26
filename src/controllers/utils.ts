type ParseIngredientsOk = { ok: true; value: string };
type ParseIngredientsErr = { ok: false; error: string };

const MAX_RECIPE_IMAGE_BYTES = 5 * 1024 * 1024;

export type ParseRecipeImageUploadOk = { ok: true; data: { dataUri: string } };
export type ParseRecipeImageUploadErr = { ok: false; error: string };
export type ParseRecipeImageUploadResult = ParseRecipeImageUploadOk | ParseRecipeImageUploadErr;

const extensionToMime = (ext: string): string | null => {
  const e = ext.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') {
    return 'image/jpeg';
  }
  if (e === 'png') {
    return 'image/png';
  }
  return null;
};

const isAllowedImageMime = (mime: string): boolean =>
  mime === 'image/jpeg' || mime === 'image/png';

export const parseRecipeImageUpload = (raw: unknown): ParseRecipeImageUploadResult => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'recipeImage must be an object' };
  }
  const obj = raw as Record<string, unknown>;
  const nameWithExtension = obj.nameWithExtension;
  const base64Content = obj.base64Content;
  if (typeof nameWithExtension !== 'string' || !nameWithExtension.trim()) {
    return { ok: false, error: 'recipeImage.nameWithExtension is required' };
  }
  if (typeof base64Content !== 'string' || !base64Content.trim()) {
    return { ok: false, error: 'recipeImage.base64Content is required' };
  }
  const name = nameWithExtension.trim();
  const lastDot = name.lastIndexOf('.');
  if (lastDot < 0 || lastDot === name.length - 1) {
    return {
      ok: false,
      error: 'recipeImage.nameWithExtension must include an extension (e.g. photo.jpg)',
    };
  }
  const ext = name.slice(lastDot + 1);
  const mimeFromExt = extensionToMime(ext);
  if (!mimeFromExt) {
    return { ok: false, error: 'recipeImage must use .jpg, .jpeg, or .png' };
  }

  let payload = base64Content.trim();
  let mime: string | null = null;
  const dataUriMatch = /^data:([^;]+);base64,(.+)$/is.exec(payload);
  if (dataUriMatch) {
    mime = dataUriMatch[1].toLowerCase().trim();
    payload = dataUriMatch[2].replace(/\s/g, '');
  } else {
    payload = payload.replace(/\s/g, '');
    mime = mimeFromExt;
  }

  if (mime && !isAllowedImageMime(mime)) {
    return { ok: false, error: 'recipeImage must be JPEG or PNG' };
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    return { ok: false, error: 'recipeImage decoded payload is empty' };
  }
  if (buffer.length > MAX_RECIPE_IMAGE_BYTES) {
    return { ok: false, error: 'recipeImage must be at most 5 MB' };
  }

  const finalMime = mime ?? mimeFromExt;
  if (!isAllowedImageMime(finalMime)) {
    return { ok: false, error: 'recipeImage must be JPEG or PNG' };
  }

  const dataUri = `data:${finalMime};base64,${payload}`;
  return { ok: true, data: { dataUri } };
};

export const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const isDuplicateKeyError = (err: unknown): boolean => {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
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
