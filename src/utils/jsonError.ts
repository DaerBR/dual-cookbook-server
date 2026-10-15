import type { Response } from 'express';

/**
 * Standard API error JSON: `{ message }`, plus optional top-level fields (e.g. `recipeCount`).
 */
export const jsonError = (
  res: Response,
  statusCode: number,
  message: string,
  extras?: Record<string, unknown>,
): void => {
  const payload: Record<string, unknown> = { message };

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      payload[key] = value;
    }
  }
  res.status(statusCode).json(payload);
};
