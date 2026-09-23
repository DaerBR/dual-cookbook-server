/**
 * One-time migration: `recipes.name` → `recipes.recipeTitle`.
 *
 * Run against your database **before** or **right when** deploying the app version that reads/writes
 * `recipeTitle` instead of `name`.
 * Safe to run multiple times: only updates documents that still have `name`.
 *
 * Template shape shared with migrate-recipe-categories.ts:
 *   connect → get raw collection → count legacy field → pipeline update (set new, unset old)
 *   → log matched/modified → re-count legacy field to verify → disconnect.
 * That file adds one extra step (dropping a stale index) that doesn't apply here.
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
  // Native driver collection, not the Mongoose model: the model's schema no longer
  // declares `name`, so a schema-bound query/update couldn't see or touch it.
  const coll = db.collection(RECIPES);

  // Step 1 — baseline count, purely for the log. Compare this to "matched" below to
  // sanity-check nothing was missed, and to the final re-count to confirm completion.
  const legacyCount = await coll.countDocuments({ name: { $exists: true } });
  console.log(`Documents with legacy field "name": ${legacyCount}`);

  // Step 2 — the actual migration, as a single atomic aggregation-pipeline update per
  // document: $set copies the old field's value into the new field, $unset drops the
  // old field. The filter `{ name: { $exists: true } }` is what makes this idempotent —
  // already-migrated docs (no `name` left) are simply not matched, so re-running is safe.
  const updateResult = await coll.updateMany({ name: { $exists: true } }, [
    { $set: { recipeTitle: '$name' } },
    { $unset: 'name' },
  ]);

  console.log(`Matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

  // Step 3 — verification: re-run the same existence check used for the baseline count.
  // Anything > 0 here means some documents didn't update (e.g. failed validation) and
  // need manual inspection; the pipeline update itself won't tell you that on its own.
  const stillLegacy = await coll.countDocuments({ name: { $exists: true } });

  if (stillLegacy > 0) {
    console.warn(`Warning: ${stillLegacy} documents still have "name". Inspect manually.`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

// Standard one-off-script entrypoint: run main(), surface any error, exit non-zero so a
// failed migration is visible to whoever/whatever invoked the script (shell, CI, etc.).
main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
