/**
 * @description Operational error with HTTP status for API responses.
 */
export class AppError extends Error {
  /** HTTP status code sent to the client. */
  readonly statusCode: number

  /** Whether the message is safe to expose to API clients. */
  readonly isOperational: boolean

  /**
   * @description Creates an application error tied to an HTTP status.
   * @param {string} message - Client-safe error message.
   * @param {number} statusCode - HTTP status code.
   * @param {boolean} [isOperational=true] - Marks expected/handled failures.
   */
  constructor(message: string, statusCode: number, isOperational = true) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.isOperational = isOperational
  }
}
