import type { ErrorRequestHandler } from 'express';
import { jsonError } from '../utils/jsonError';

/** Fallback messages for errors that carry a status but no message (e.g. non-`Error` values). */
const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  401: 'Unauthorized access',
  403: 'You must be logged in in order to access this resource',
  404: 'Resource not found',
  413: 'Request body too large',
};

/**
 * Global error handler — register last, after all routes. `err` is typed `unknown` (Express types it `any`)
 * because anything can be thrown or passed to `next()`.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
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
    err instanceof Error && err.message ? err.message : (DEFAULT_ERROR_MESSAGES[httpStatus] ?? 'Internal server error');
  jsonError(res, httpStatus, message);
};
