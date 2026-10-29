import type { NextFunction, Request, Response } from 'express'

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>

/**
 * @description Wraps async Express handlers so rejections reach the error middleware.
 * @param {AsyncRouteHandler} handler - Async route implementation.
 * @returns {AsyncRouteHandler} Wrapped handler.
 */
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next)
  }
}
