import express from 'express';
import cookieSession from 'cookie-session';
import passport from 'passport';
import cors from 'cors';
import { getEnv } from './config/env';
import './models/User';
import './models/Category';
import './models/Recipe';
import './services/passport';
import { registerAuthRoutes } from './routes/authRoutes';
import { requireLoginExceptSafeMethods } from './middlewares/requireLogin';
import { recipeRouter } from './routes/recipeRoutes';
import { categoryRouter } from './routes/categoryRoutes';
import { setupSwagger } from './swagger/setupSwagger';
import { jsonError } from './utils/jsonError';

export const createApp = (): express.Application => {
  const app = express();
  const env = getEnv();

  /** Avoid 304 + empty body on repeat GETs (e.g. `/api/current_user`) when the JSON is unchanged. */
  app.set('etag', false);

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const corsOrigin = env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true;

  app.use(cors({ origin: corsOrigin, credentials: true }));
  /** Default Express JSON limit is 100kb; base64 image payloads exceed that quickly (see `MAX_RECIPE_IMAGE_BYTES` in controllers). */
  app.use(express.json({ limit: '10mb' }));

  const sessionCookieCrossSite = env.NODE_ENV === 'production';

  app.use(
    cookieSession({
      maxAge: 30 * 24 * 60 * 60 * 1000,
      keys: [env.COOKIE_KEY],
      name: 'session',
      httpOnly: true,
      /** Cross-origin SPA (e.g. Vercel → Render): Lax cookies are not sent on XHR; None+Secure is required. */
      secure: sessionCookieCrossSite,
      sameSite: sessionCookieCrossSite ? 'none' : 'lax',
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  registerAuthRoutes(app);
  setupSwagger(app);

  app.use('/api/recipes', requireLoginExceptSafeMethods, recipeRouter);
  app.use('/api/categories', requireLoginExceptSafeMethods, categoryRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      err !== null &&
      typeof err === 'object' &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : undefined;
    if (status === 401) {
      const message = err instanceof Error ? err.message : 'Unauthorized access';
      jsonError(res, 401, message);
      return;
    }
    if (status === 403) {
      const message = err instanceof Error ? err.message : 'You must be logged in in order to access this resource';
      jsonError(res, 403, message);
      return;
    }
    if (status === 404) {
      const message = err instanceof Error ? err.message : 'Resource not found';
      jsonError(res, 404, message);
      return;
    }
    if (status === 413) {
      const message = err instanceof Error ? err.message : 'Request body too large';
      jsonError(res, 413, message);
      return;
    }
    console.error(err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    jsonError(res, 500, message);
  });

  return app;
};
