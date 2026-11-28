import mongoose from 'mongoose';
import '../src/config/loadEnv';
import { Recipe } from '../src/models/Recipe';

const searchInSteps = async (): Promise<string[]> => {
  const searchTerm = 'аерогрил';
  const aeroRecipes = await Recipe.find({
    'steps.stepDescription': { $regex: searchTerm, $options: 'i' },
  })
    .select('_id')
    .lean();

  const ids = aeroRecipes.map((recipe) => recipe._id.toString());

  console.log(ids);

  return ids;
};

const main = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;

  if (!uri?.trim()) {
    console.error('Set MONGO_URI in .env (same as the API uses).');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const ids = await searchInSteps();
  console.log(`Found ${ids.length} recipes:`);
  console.log(ids);

  await mongoose.disconnect();
};

main().catch(async (err: unknown) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
