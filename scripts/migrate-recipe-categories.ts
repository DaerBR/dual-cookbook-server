/**
 * One-time migration: `recipes.category` (single ObjectId) → `recipes.categories` (array).
 *
 * Run against your database **before** or **right when** deploying the app version that uses `categories`.
 * Safe to run multiple times: only updates documents that still have `category`.
 */
import '../src/config/loadEnv';
import mongoose from 'mongoose';

const RECIPES = 'recipes';

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri || !uri.trim()) {
    console.error('Set MONGO_URI in .env (same as the API uses).');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to connect to MongoDB.');
    process.exit(1);
  }
  const coll = db.collection(RECIPES);

  const legacyCount = await coll.countDocuments({ category: { $exists: true } });
  console.log(`Documents with legacy field "category": ${legacyCount}`);

  const updateResult = await coll.updateMany(
    { category: { $exists: true } },
    [{ $set: { categories: ['$category'] } }, { $unset: 'category' }],
  );

  console.log(`Matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

  const oldIndexName = 'category_1_createdAt_-1';
  try {
    await coll.dropIndex(oldIndexName);
    console.log(`Dropped index ${oldIndexName}`);
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: number }).code : undefined;
    if (code === 27) {
      console.log(`Index ${oldIndexName} not present (already dropped or never created).`);
    } else {
      throw err;
    }
  }

  const stillLegacy = await coll.countDocuments({ category: { $exists: true } });
  if (stillLegacy > 0) {
    console.warn(`Warning: ${stillLegacy} documents still have "category". Inspect manually.`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
