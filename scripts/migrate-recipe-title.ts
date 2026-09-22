/**
 * One-time migration: `recipes.name` → `recipes.recipeTitle`.
 *
 * Run against your database **before** or **right when** deploying the app version that reads/writes
 * `recipeTitle` instead of `name`.
 * Safe to run multiple times: only updates documents that still have `name`.
 */
import mongoose from 'mongoose';
import '../src/config/loadEnv';

const RECIPES = 'recipes';

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;

  if (!uri?.trim()) {
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

  const legacyCount = await coll.countDocuments({ name: { $exists: true } });
  console.log(`Documents with legacy field "name": ${legacyCount}`);

  const updateResult = await coll.updateMany({ name: { $exists: true } }, [
    { $set: { recipeTitle: '$name' } },
    { $unset: 'name' },
  ]);

  console.log(`Matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

  const stillLegacy = await coll.countDocuments({ name: { $exists: true } });

  if (stillLegacy > 0) {
    console.warn(`Warning: ${stillLegacy} documents still have "name". Inspect manually.`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
