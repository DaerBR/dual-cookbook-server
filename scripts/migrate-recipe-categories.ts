/**
 * One-time migration: `recipes.category` (single ObjectId) → `recipes.categories` (array).
 *
 * Run against your database **before** or **right when** deploying the app version that uses `categories`.
 * Safe to run multiple times: only updates documents that still have `category`.
 *
 * Template shape shared with migrate-recipe-title.ts:
 *   connect → get raw collection → count legacy field → pipeline update (set new, unset old)
 *   → log matched/modified → re-count legacy field to verify → disconnect.
 * This file adds one extra step that one doesn't need: dropping the index tied to the old
 * field, since a field-rename alone doesn't leave a stale index behind but removing an
 * indexed field does.
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
  // declares `category`, so a schema-bound query/update couldn't see or touch it.
  const coll = db.collection(RECIPES);

  // Step 1 — baseline count, purely for the log. Compare this to "matched" below to
  // sanity-check nothing was missed, and to the final re-count to confirm completion.
  const legacyCount = await coll.countDocuments({ category: { $exists: true } });
  console.log(`Documents with legacy field "category": ${legacyCount}`);

  // Step 2 — the actual migration, as a single atomic aggregation-pipeline update per
  // document: $set derives the new field from the old one (here, wrapping the single
  // ObjectId in an array rather than a straight rename), $unset drops the old field.
  // The filter `{ category: { $exists: true } }` is what makes this idempotent —
  // already-migrated docs (no `category` left) are simply not matched, so re-running is safe.
  const updateResult = await coll.updateMany({ category: { $exists: true } }, [
    { $set: { categories: ['$category'] } },
    { $unset: 'category' },
  ]);

  console.log(`Matched: ${updateResult.matchedCount}, modified: ${updateResult.modifiedCount}`);

  // Extra step (categories-specific): the old field had its own index, which is now
  // pointless/broken since the field is gone. dropIndex() throws if the index doesn't
  // exist, so catch and check for MongoDB's "IndexNotFound" error code (27) and treat
  // that as a no-op rather than a failure — keeps the script safe to re-run.
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

  // Step 3 — verification: re-run the same existence check used for the baseline count.
  // Anything > 0 here means some documents didn't update (e.g. failed validation) and
  // need manual inspection; the pipeline update itself won't tell you that on its own.
  const stillLegacy = await coll.countDocuments({ category: { $exists: true } });

  if (stillLegacy > 0) {
    console.warn(`Warning: ${stillLegacy} documents still have "category". Inspect manually.`);
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
