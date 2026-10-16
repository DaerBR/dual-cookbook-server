/**
 * Error carrying an HTTP status code. Throw it from services/controllers; the global error handler in `app.ts`
 * responds with `status` and `message`.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
