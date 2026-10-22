import type { RequestHandler } from 'express';

type SessionCallback = (err?: unknown) => void;

/**
 * passport@0.6+ calls `req.session.regenerate()` on login and `save()` + `regenerate()` on logout (session
 * fixation protection). Those are `express-session` APIs; `cookie-session` has neither, so passport would crash.
 *
 * - `regenerate` empties the session, so nothing from before login/logout carries over — the closest
 *   equivalent of a fresh session when the whole session lives in the cookie.
 * - `save` is a no-op: `cookie-session` writes the cookie automatically when the response is sent.
 *
 * Both are defined non-enumerable so `regenerate` does not delete them and they never end up in the cookie.
 * Must be registered after `cookieSession()` and before `passport.session()`.
 */
export const cookieSessionPassportShim: RequestHandler = (req, _res, next) => {
  const session = req.session as Record<string, unknown> | null | undefined;

  if (session && !('regenerate' in session)) {
    Object.defineProperty(session, 'regenerate', {
      value: (cb: SessionCallback) => {
        for (const key of Object.keys(session)) {
          delete session[key];
        }
        cb();
      },
    });
  }

  if (session && !('save' in session)) {
    Object.defineProperty(session, 'save', {
      value: (cb: SessionCallback) => cb(),
    });
  }

  next();
};
