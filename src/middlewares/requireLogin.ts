import type { RequestHandler } from 'express';
import { jsonError } from '../utils/jsonError';

export const requireLogin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    jsonError(res, 401, 'You must log in!');
    return;
  }
  next();
};
