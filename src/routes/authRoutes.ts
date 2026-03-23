import type { Express, Request, Response } from 'express';
import passport from 'passport';
import { logoutSync } from '../utils/passportLogout';

export function registerAuthRoutes(app: Express): void {
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
    (_req: Request, res: Response) => {
      res.redirect('/');
    },
  );

  app.get('/auth/google/failure', (_req: Request, res: Response) => {
    res.status(403).json({
      error: 'Your Google account is not authorized to use this application.',
    });
  });

  app.get('/api/current_user', (req: Request, res: Response) => {
    if (!req.user) {
      res.json(null);
      return;
    }
    res.json({
      id: req.user.id,
      displayName: req.user.displayName,
      email: req.user.email,
      createdAt: req.user.createdAt,
    });
  });

  app.get('/api/logout', (req: Request, res: Response) => {
    logoutSync(req, res);
  });
}
