import type { NextFunction, Request, Response } from 'express'

import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

type ErrorResponseBody = {
  success: false
  message: string
  errors?: Record<string, string[]>
}

/**
 * @description Express error middleware returning a consistent JSON shape.
 * @param {unknown} err - Thrown error or AppError.
 * @param {Request} _req - Express request.
 * @param {Response} res - Express response.
 * @param {NextFunction} _next - Express next function.
 * @returns {void}
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const body: ErrorResponseBody = {
    success: false,
    message: 'Internal server error',
  }

  if (err instanceof AppError) {
    body.message = err.message
    res.status(err.statusCode).json(body)
    return
  }

  if (err instanceof Error && env.NODE_ENV !== 'production') {
    body.message = err.message
  }

  console.error('[error]', err)
  res.status(500).json(body)
}
