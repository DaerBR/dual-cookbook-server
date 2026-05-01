const MAX_RECIPE_IMAGE_BYTES = 5 * 1024 * 1024;

const MAX_INGREDIENT_LENGTH = 255;

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

const parseImageUpload = (raw: unknown, field: string): ParseRecipeImageUploadResult => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: `${field} must be an object` };
  }
  const obj = raw as Record<string, unknown>;
  const nameWithExtension = obj.nameWithExtension;
  const base64Content = obj.base64Content;
  if (typeof nameWithExtension !== 'string' || !nameWithExtension.trim()) {
    return { ok: false, error: `${field}.nameWithExtension is required` };
  }
  if (typeof base64Content !== 'string' || !base64Content.trim()) {
    return { ok: false, error: `${field}.base64Content is required` };
  }
  const name = nameWithExtension.trim();
  const lastDot = name.lastIndexOf('.');
  if (lastDot < 0 || lastDot === name.length - 1) {
    return {
      ok: false,
      error: `${field}.nameWithExtension must include an extension (e.g. photo.jpg)`,
    };
  }
  const ext = name.slice(lastDot + 1);
  const mimeFromExt = extensionToMime(ext);
  if (!mimeFromExt) {
    return { ok: false, error: `${field} must use .jpg, .jpeg, or .png` };
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
    return { ok: false, error: `${field} must be JPEG or PNG` };
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    return { ok: false, error: `${field} decoded payload is empty` };
  }
  if (buffer.length > MAX_RECIPE_IMAGE_BYTES) {
    return { ok: false, error: `${field} must be at most 5 MB` };
  }

  const finalMime = mime ?? mimeFromExt;
  if (!isAllowedImageMime(finalMime)) {
    return { ok: false, error: `${field} must be JPEG or PNG` };
  }

  const dataUri = `data:${finalMime};base64,${payload}`;
  return { ok: true, data: { dataUri } };
};

export const parseRecipeImageUpload = (raw: unknown): ParseRecipeImageUploadResult =>
  parseImageUpload(raw, 'recipeImage');

export const parseCategoryImageUpload = (raw: unknown): ParseRecipeImageUploadResult =>
  parseImageUpload(raw, 'categoryImage');

export const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const isDuplicateKeyError = (err: unknown): boolean => {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
};

/** Shape passed to Mongoose for embedded ingredients (subdocument `_id` is generated on save). */
export type ParsedRecipeIngredient = {
  text: string;
};

type ParseRecipeIngredientsOk = { ok: true; value: ParsedRecipeIngredient[] | undefined };
type ParseRecipeIngredientsErr = { ok: false; error: string };
export type ParseRecipeIngredientsResult = ParseRecipeIngredientsOk | ParseRecipeIngredientsErr;

/**
 * Parses optional `ingredients`: array of `{ text }`; each `text` at most {@link MAX_INGREDIENT_LENGTH} chars.
 * Omit (`undefined` / `null`) means no ingredients in the payload. Create/update replace the full list when present.
 */
export const parseRecipeIngredients = (raw: unknown): ParseRecipeIngredientsResult => {
  const field = 'ingredients';
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${field} must be an array` };
  }

  const value: ParsedRecipeIngredient[] = [];
  for (let i = 0; i < raw.length; i++) {
    const el = raw[i];
    if (el === null || typeof el !== 'object' || Array.isArray(el)) {
      return { ok: false, error: `${field}[${i}] must be an object` };
    }
    const obj = el as Record<string, unknown>;
    const textRaw = obj.text;
    if (typeof textRaw !== 'string' || !textRaw.trim()) {
      return { ok: false, error: `${field}[${i}].text must be a non-empty string` };
    }
    const text = textRaw.trim();
    if (text.length > MAX_INGREDIENT_LENGTH) {
      return {
        ok: false,
        error: `${field}[${i}].text must be at most ${MAX_INGREDIENT_LENGTH} characters`,
      };
    }
    value.push({ text });
  }

  return { ok: true, value };
};

/** Shape passed to Mongoose for embedded steps (subdocument `_id` is generated on save). */
export type ParsedRecipeStep = {
  stepDescription: string;
};

type ParseRecipeStepsOk = { ok: true; value: ParsedRecipeStep[] };
type ParseRecipeStepsErr = { ok: false; error: string };
export type ParseRecipeStepsResult = ParseRecipeStepsOk | ParseRecipeStepsErr;

/**
 * Parses `steps`: non-empty array of `{ stepDescription }` only.
 * Create/update always replace steps; the server assigns new subdocument ids.
 */
export const parseRecipeSteps = (raw: unknown): ParseRecipeStepsResult => {
  const field = 'steps';
  if (raw === undefined || raw === null) {
    return { ok: false, error: `${field} is required` };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${field} must be an array` };
  }
  if (raw.length < 1) {
    return { ok: false, error: `${field} must contain at least one entry` };
  }

  const value: ParsedRecipeStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const el = raw[i];
    if (el === null || typeof el !== 'object' || Array.isArray(el)) {
      return { ok: false, error: `${field}[${i}] must be an object` };
    }
    const obj = el as Record<string, unknown>;
    const descRaw = obj.stepDescription;
    if (typeof descRaw !== 'string' || !descRaw.trim()) {
      return { ok: false, error: `${field}[${i}].stepDescription must be a non-empty string` };
    }

    value.push({ stepDescription: descRaw.trim() });
  }

  return { ok: true, value };
};
