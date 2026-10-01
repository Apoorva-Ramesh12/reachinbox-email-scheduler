export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'APP_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(msg: string, details?: unknown) {
    return new AppError(400, msg, 'BAD_REQUEST', details);
  }
  static unauthorized(msg = 'Authentication required') {
    return new AppError(401, msg, 'UNAUTHORIZED');
  }
  static notFound(msg = 'Resource not found') {
    return new AppError(404, msg, 'NOT_FOUND');
  }
  static conflict(msg: string) {
    return new AppError(409, msg, 'CONFLICT');
  }
}
