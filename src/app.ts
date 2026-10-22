import express from 'express';
import cookieSession from 'cookie-session';
import passport from 'passport';
import cors from 'cors';
import { getCorsOriginAllowlist } from './config/corsOrigins';
import { getEnv } from './config/env';
import './models/User';
import './models/Category';
import './models/Recipe';
import './services/passport';
import { registerAuthRoutes } from './routes/authRoutes';
import { requireLoginExceptSafeMethods } from './middlewares/requireLogin';
import { cookieSessionPassportShim } from './middlewares/cookieSessionPassportShim';
import { errorHandler } from './middlewares/errorHandler';
import { recipeRouter } from './routes/recipeRoutes';
import { categoryRouter } from './routes/categoryRoutes';
import { setupSwagger } from './swagger/setupSwagger';

export const createApp = (): express.Application => {
  const app = express();
  const env = getEnv();

  /** Avoid 304 + empty body on repeat GETs (e.g. `/api/current_user`) when the JSON is unchanged. */
  app.set('etag', false);

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  const allowlist = getCorsOriginAllowlist();
  const corsOrigin = allowlist.length > 0 ? allowlist : true;

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
  app.use(cookieSessionPassportShim);
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  registerAuthRoutes(app);
  setupSwagger(app);

  app.use('/api/recipes', requireLoginExceptSafeMethods, recipeRouter);
  app.use('/api/categories', requireLoginExceptSafeMethods, categoryRouter);

  app.use(errorHandler);

  return app;
};
