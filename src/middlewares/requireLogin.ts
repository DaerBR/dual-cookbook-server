import type { RequestHandler } from 'express';

export const requireLogin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'You must log in!' });
    return;
  }
  next();
};
