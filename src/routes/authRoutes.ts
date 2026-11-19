import type { Express, NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { getCorsOriginAllowlist } from '../config/corsOrigins';
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

const NOT_AUTHORIZED_MESSAGE = 'Цьому аккаунту не надано дозвіл на користування додатком.';

interface PopupMessage {
  [key: string]: unknown;
  type: 'GOOGLE_AUTH_SUCCESS' | 'GOOGLE_AUTH_FAILURE' | 'GOOGLE_AUTH_CANCELLED';
}

/**
 * `<script>` for the OAuth popup: `postMessage`s `message` to the opener (if any) and closes the popup.
 * Without an opener (e.g. `/auth/google` opened directly in a tab) the window stays open.
 */
const buildPopupScript = (req: Request, message: PopupMessage): string => {
  const targetOrigin = resolvePostMessageTarget(req);

  return `<script>
        (function () {
          const message = ${JSON.stringify(message)};
          const target = ${JSON.stringify(targetOrigin)};
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(message, target);
            window.close();
          }
        })();
        </script>`;
};

const sendAuthSuccessPage = (req: Request, res: Response, user: Express.User): void => {
  const payload = {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt,
  };

  res.type('html').send(buildPopupScript(req, { type: 'GOOGLE_AUTH_SUCCESS', payload }));
};

/** Popup: notify the opener and close. Fallback (no opener): readable error page instead of raw JSON. */
const sendAuthFailurePage = (req: Request, res: Response): void => {
  res.status(403).type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign-in not allowed</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #fff; font-family: Roboto, sans-serif; }
\t\tmain { padding: 24px; text-align: center; }
\t\tp { color: rgb(237, 122, 65); font-size: 18px; margin: 0 0 20px; font-weight: 500}
\t\tbutton { padding: 10px 28px; border-radius: 4px; font-weight: 500; font-size: 14px; cursor: pointer; height: 40px; background-color: #fd874c; border: none; color: #fff; }
    </style>
  </head>
  <body>
    <main>
      <p>${NOT_AUTHORIZED_MESSAGE}</p>
      <button type="button" onclick="window.close()">Закрити</button>
    </main>
    ${buildPopupScript(req, { type: 'GOOGLE_AUTH_FAILURE', message: NOT_AUTHORIZED_MESSAGE })}
  </body>
</html>`);
};

/**
 * Custom Passport callback (instead of `failureRedirect`) so the failure response still has `req.query.state`
 * for the `postMessage` target. With a custom callback the session must be established via `req.logIn`.
 */
const handleGoogleCallback = (req: Request, res: Response, next: NextFunction) => {
  /** User pressed "Cancel" on Google's screen. Passport would treat it as a failure ("not authorized"), so handle it first. */
  if (req.query.error === 'access_denied') {
    res.type('html').send(buildPopupScript(req, { type: 'GOOGLE_AUTH_CANCELLED' }));

    return;
  }

  passport.authenticate('google', (err: unknown, user: Express.User | false | null | undefined) => {
    if (err) {
      next(err);

      return;
    }

    if (!user) {
      sendAuthFailurePage(req, res);

      return;
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        next(loginErr);

        return;
      }
      sendAuthSuccessPage(req, res, user);
    });
  })(req, res, next);
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

  app.get('/auth/google/callback', handleGoogleCallback);

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

  app.get('/api/logout', (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
      if (err) {
        next(err);

        return;
      }
      res.json({ ok: true });
    });
  });
};
