import type { Express, NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { getCorsOriginAllowlist } from '../config/corsOrigins';
import { logoutSync } from '../utils/passportLogout';
import { jsonError } from '../utils/jsonError';

/**
 * `postMessage` second argument: validated OAuth `state` (from `?return_origin=` on `/auth/google`) if it
 * is in the CORS allowlist, else the first allowlisted origin, else `*`.
 *
 * Important: the target string must match `window.opener`'s origin or the browser drops the message.
 */
const resolvePostMessageTarget = (req: Request): string => {
  const allowlist = getCorsOriginAllowlist();
  const fromOAuth = typeof req.query.state === 'string' ? req.query.state.trim() : '';
  if (fromOAuth && allowlist.includes(fromOAuth)) {
    return fromOAuth;
  }
  if (allowlist.length > 0) {
    return allowlist[0]!;
  }
  return '*';
};

const getOriginFromReferer = (req: Request): string | undefined => {
  const referer = req.get('referer');
  if (!referer) {
    return undefined;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
};

const startGoogleAuth = (req: Request, res: Response, next: NextFunction) => {
  const allowlist = getCorsOriginAllowlist();
  const raw = req.query.return_origin;
  let returnOrigin = typeof raw === 'string' ? raw.trim() : undefined;

  /** Without OAuth `state`, callback falls back to the *first* CORS origin — wrong for hosted SPA if localhost is listed first. Prefer Referer when it matches the allowlist. */
  if (!returnOrigin && allowlist.length > 0) {
    const fromReferer = getOriginFromReferer(req);
    if (fromReferer && allowlist.includes(fromReferer)) {
      returnOrigin = fromReferer;
    }
  }

  if (returnOrigin) {
    if (allowlist.length === 0) {
      jsonError(res, 400, 'return_origin requires CORS_ORIGIN to be set');
      return;
    }
    if (!allowlist.includes(returnOrigin)) {
      jsonError(res, 400, 'Invalid return_origin');
      return;
    }
  }

  const authOptions: { scope: string[]; state?: string } = {
    scope: ['profile', 'email'],
  };
  if (returnOrigin) {
    authOptions.state = returnOrigin;
  }

  passport.authenticate('google', authOptions)(req, res, next);
};

export const registerAuthRoutes = (app: Express): void => {
  app.get('/auth/google', startGoogleAuth);

  app.get(
      '/auth/google/callback',
      passport.authenticate('google', {
        failureRedirect: '/auth/google/failure',
      }),
      (req: Request, res: Response) => {
        const user = req.user;
        if (!user) {
          res.redirect('/auth/google/failure');
          return;
        }

        const payload = {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          createdAt: user.createdAt,
        };
        const targetOrigin = resolvePostMessageTarget(req);
        const payloadJson = JSON.stringify(payload);

        res.type('html').send(`<script>
        (function () {
          var payload = ${payloadJson};
          var target = ${JSON.stringify(targetOrigin)};
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', payload: payload }, target);
          }
          window.close();
        })();
        </script>`);
      },

  );

  app.get('/auth/google/failure', (_req: Request, res: Response) => {
    jsonError(res, 403, 'Your Google account is not authorized to use this application.');
  });

  app.get('/api/current_user', (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.user) {
      res.json(null);
      return;
    }
    res.json({
      id: req.user.id,
      displayName: req.user.displayName,
      email: req.user.email,
    });
  });

  app.get('/api/logout', (req: Request, res: Response) => {
    logoutSync(req);
    res.json({ ok: true });
  });
};
