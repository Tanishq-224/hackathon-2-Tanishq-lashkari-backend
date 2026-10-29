import type { NextFunction, Request, Response } from 'express'

import { findUserByEmail, type UserRole } from '../repositories/auth.repository.js'
import { getSessionCookieName } from '../services/auth.service.js'
import { verifySessionToken } from '../services/session.service.js'
import { AppError } from '../utils/AppError.js'

export type AuthenticatedUser = {
  id: string
  fullName: string
  email: string
  role: UserRole
}

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser
}

/**
 * @description Requires an active, verified user session cookie.
 * @async
 * @param {AuthenticatedRequest} req - Express request with user slot.
 * @param {Response} res - Express response.
 * @param {NextFunction} next - Express next handler.
 * @returns {Promise<void>}
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[getSessionCookieName()] as string | undefined
  if (!token) {
    throw new AppError('Not authenticated. Please log in.', 401)
  }

  const payload = verifySessionToken(token)
  if (!payload) {
    res.clearCookie(getSessionCookieName(), { path: '/' })
    throw new AppError('Session expired. Please log in again.', 401)
  }

  const user = await findUserByEmail(payload.email)
  if (!user || !user.emailVerified) {
    res.clearCookie(getSessionCookieName(), { path: '/' })
    throw new AppError('Not authenticated or email unverified.', 401)
  }

  req.user = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  }

  next()
}

/**
 * @description Restricts route access to specific roles (e.g. customer, vendor).
 * @param {...UserRole[]} allowedRoles - List of allowed roles.
 * @returns {Function} Express middleware.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Not authenticated. Please log in.', 401)
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        `Forbidden. Access restricted to: ${allowedRoles.join(', ')}.`,
        403,
      )
    }

    next()
  }
}

