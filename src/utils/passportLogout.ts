import type { Request, Response } from 'express';

/**
 * passport@0.5.x implements `logout()` synchronously with no arguments.
 * `@types/passport` targets newer versions that pass a callback — use this helper instead.
 */
export const logoutSync = (req: Request, res: Response): void => {
  (req as Request & { logout: () => void }).logout();
  res.redirect('/');
};
