/**
 * Runs `mongodump` using MONGO_URI from .env (same as the app).
 * Requires MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools
 */
import '../src/config/loadEnv';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const main = (): void => {
  const uri = process.env.MONGO_URI;
  if (!uri?.trim()) {
    console.error('Set MONGO_URI in .env (same as the API).');
    process.exit(1);
  }

  const dir = path.join(process.cwd(), 'mongo-backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = path.join(dir, `backup-${stamp}.archive.gz`);

  const result = spawnSync(
    'mongodump',
    ['--uri', uri, '--gzip', '--archive', archivePath],
    { stdio: 'inherit' },
  );

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        'mongodump was not found. Install MongoDB Database Tools and ensure it is on your PATH:\n' +
          'https://www.mongodb.com/try/download/database-tools',
      );
    } else {
      console.error(result.error);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log(`Wrote ${archivePath}`);
};

main();
