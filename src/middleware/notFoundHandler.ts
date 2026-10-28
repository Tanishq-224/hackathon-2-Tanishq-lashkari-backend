import type { NextFunction, Request, Response } from 'express'

import { AppError } from '../utils/AppError.js'

/**
 * @description Handles unknown routes before the global error handler.
 * @param {Request} req - Express request.
 * @param {Response} _res - Express response.
 * @param {NextFunction} next - Express next callback.
 * @returns {void}
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404))
}
