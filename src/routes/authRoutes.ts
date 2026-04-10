import type { Express, Request, Response } from 'express';
import passport from 'passport';
import { getEnv } from '../config/env';
import { logoutSync } from '../utils/passportLogout';
import { jsonError } from '../utils/jsonError';

/** Origin allowed to receive postMessage from the OAuth popup (first entry in CORS_ORIGIN, or '*' if unset). */
const getOAuthPopupPostMessageTarget = (): string => {
  const first = getEnv()
      .CORS_ORIGIN?.split(',')
      .map((s) => s.trim())
      .find(Boolean);
  return first ?? '*';
};

export const registerAuthRoutes = (app: Express): void => {
  app.get(
      '/auth/google',
      passport.authenticate('google', {
        scope: ['profile', 'email'],
      }),
  );

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
        const targetOrigin = getOAuthPopupPostMessageTarget();
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
