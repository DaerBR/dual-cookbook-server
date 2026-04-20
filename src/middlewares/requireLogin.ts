import type { RequestHandler } from 'express';
import { jsonError } from '../utils/jsonError';

export const requireLogin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    jsonError(res, 401, 'Please log in to access this page!');
    return;
  }
  next();
};

/** Same as {@link requireLogin}, but skips auth for safe/read-only requests (GET, HEAD, OPTIONS). */
export const requireLoginExceptSafeMethods: RequestHandler = (req, res, next) => {
  const m = req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
    next();
    return;
  }
  requireLogin(req, res, next);
};
