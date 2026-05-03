/**
 * Batch-import recipes from `scripts/importedRecipes.json` (same shape as POST /api/recipes).
 *
 * Usage: `npm run import:recipes`
 * Requires MONGO_URI in .env (same as the API).
 */
import path from 'path';
import { readFileSync } from 'fs';
import '../src/config/loadEnv';
import mongoose from 'mongoose';
import { Recipe } from '../src/models/Recipe';
import { Category } from '../src/models/Category';
import { User } from '../src/models/User';
import {
  parseRecipeCategories,
  parseRecipeIngredients,
  parseRecipeSteps,
} from '../src/controllers/utils';

const TARGET_USER_ID = '69c3ffc4448a9114c2640cae';
const JSON_PATH = path.join(__dirname, 'importedRecipes.json');

type RecipePayload = Record<string, unknown>;

/**
 * Drops ingredients whose `text` is missing, empty after trim, or not a string.
 * Import-only: keeps POST/API validation unchanged for real clients.
 */
function sanitizeIngredientsForImport(raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return raw;
  }
  if (!Array.isArray(raw)) {
    return raw;
  }
  const filtered: { text: string }[] = [];
  for (const el of raw) {
    if (el === null || typeof el !== 'object' || Array.isArray(el)) {
      continue;
    }
    const textRaw = (el as Record<string, unknown>).text;
    if (typeof textRaw !== 'string' || !textRaw.trim()) {
      continue;
    }
    filtered.push({ text: textRaw.trim() });
  }
  return filtered;
}

function buildCreatePayload(body: RecipePayload, createdBy: mongoose.Types.ObjectId): Record<string, unknown> {
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('name is required');
  }

  const categoriesResult = parseRecipeCategories(body.categories);
  if (!categoriesResult.ok) {
    throw new Error(categoriesResult.error);
  }

  const ingredientsResult = parseRecipeIngredients(sanitizeIngredientsForImport(body.ingredients));
  if (!ingredientsResult.ok) {
    throw new Error(ingredientsResult.error);
  }

  const stepsResult = parseRecipeSteps(body.steps);
  if (!stepsResult.ok) {
    throw new Error(stepsResult.error);
  }

  const sourceUrlRaw = body.sourceUrl;
  const sourceUrl =
    typeof sourceUrlRaw === 'string' && sourceUrlRaw.trim() ? sourceUrlRaw.trim() : undefined;

  return {
    name: name.trim(),
    categories: categoriesResult.value,
    description: typeof body.description === 'string' ? body.description.trim() : undefined,
    ...(ingredientsResult.value !== undefined ? { ingredients: ingredientsResult.value } : {}),
    steps: stepsResult.value,
    createdBy,
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
  };
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri || !uri.trim()) {
    console.error('Set MONGO_URI in .env (same as the API uses).');
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  } catch (err: unknown) {
    console.error(`Failed to read or parse ${JSON_PATH}:`, err);
    process.exit(1);
  }

  if (!Array.isArray(raw)) {
    console.error('importedRecipes.json must be a JSON array.');
    process.exit(1);
  }

  const createdBy = new mongoose.Types.ObjectId(TARGET_USER_ID);

  await mongoose.connect(uri);

  const owner = await User.findById(TARGET_USER_ID).select('_id').lean();
  if (!owner) {
    console.error(`User ${TARGET_USER_ID} was not found.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const docs: Record<string, unknown>[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      console.error(`Row ${i}: expected an object`);
      await mongoose.disconnect();
      process.exit(1);
    }
    try {
      docs.push(buildCreatePayload(item as RecipePayload, createdBy));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Row ${i} (${(item as RecipePayload).name ?? '?'}): ${msg}`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  const categoryIds = new Set<string>();
  for (const d of docs) {
    const cats = d.categories as string[];
    cats.forEach((c) => categoryIds.add(c));
  }
  const foundCount = await Category.countDocuments({
    _id: { $in: [...categoryIds].map((id) => new mongoose.Types.ObjectId(id)) },
  });
  if (foundCount !== categoryIds.size) {
    console.error('One or more categories from the file do not exist in the database.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const result = await Recipe.insertMany(docs);
  console.log(`Inserted ${result.length} recipe(s) for user ${TARGET_USER_ID}.`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
