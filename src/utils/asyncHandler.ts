import type { Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route so rejections are forwarded to Express error handling.
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res).catch(next);
  };
}
