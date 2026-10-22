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
import { recipeRouter } from './routes/recipeRoutes';
import { categoryRouter } from './routes/categoryRoutes';
import { setupSwagger } from './swagger/setupSwagger';
import { jsonError } from './utils/jsonError';

/** Fallback messages for errors that carry a status but no message (e.g. non-`Error` values). */
const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  401: 'Unauthorized access',
  403: 'You must be logged in in order to access this resource',
  404: 'Resource not found',
  413: 'Request body too large',
};

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

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    /** A response was already (partially) sent — let Express close the connection instead of sending a second one. */
    if (res.headersSent) {
      next(err);

      return;
    }

    const status =
      err !== null &&
      typeof err === 'object' &&
      'status' in err &&
      typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : undefined;

    /** Any 4xx/5xx carried by the error (`HttpError`, body-parser, passport…) is passed through; anything else is a 500. */
    const httpStatus = status !== undefined && status >= 400 && status <= 599 ? status : 500;

    if (httpStatus >= 500) {
      console.error(err);
    }

    const message =
      err instanceof Error && err.message
        ? err.message
        : (DEFAULT_ERROR_MESSAGES[httpStatus] ?? 'Internal server error');
    jsonError(res, httpStatus, message);
  });

  return app;
};
