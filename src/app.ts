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
import { requireLogin } from './middlewares/requireLogin';
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

  const corsOrigin = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true;

  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json());

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

  app.use('/api/recipes', requireLogin, recipeRouter);
  app.use('/api/categories', requireLogin, categoryRouter);

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: message });
    },
  );

  return app;
};
