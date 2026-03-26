import './config/loadEnv';
import mongoose from 'mongoose';
import { getEnv } from './config/env';
import { createApp } from './app';

const main = async (): Promise<void> => {
  const env = getEnv();
  await mongoose.connect(env.MONGO_URI);
  console.log('Connected to MongoDB');

  const app = createApp();
  const port = env.PORT;
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`Swagger UI: http://localhost:${port}/api/docs`);
  });
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
