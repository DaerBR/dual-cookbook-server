import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  COOKIE_KEY: z.string().min(1, 'COOKIE_KEY is required'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  /** Public base URL of this API (no trailing slash), used for OAuth callback and Swagger "Try it out". */
  BASE_URL: z.string().url().optional(),
  /** If set, overrides BASE_URL for Google OAuth redirect URI construction. */
  GOOGLE_CALLBACK_BASE: z.string().url().optional(),
  /** Comma-separated list; defaults to the two family accounts. */
  ALLOWED_EMAILS: z.string().optional(),
  /** Optional comma-separated exact origins for browser clients + OAuth popup target (e.g. `http://localhost:5173,https://app.example.com`). Omit to reflect any origin in CORS. */
  CORS_ORIGIN: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
  CLOUDINARY_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export const getEnv = (): Env => {
  if (cached) {
    return cached;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
};

export const getPublicBaseUrl = (): string => {
  const e = getEnv();
  return (e.GOOGLE_CALLBACK_BASE ?? e.BASE_URL ?? `http://localhost:${e.PORT}`).replace(/\/$/, '');
};
