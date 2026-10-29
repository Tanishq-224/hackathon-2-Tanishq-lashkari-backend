import jwt from 'jsonwebtoken'

import { env } from '../config/env.js'

export type SessionPayload = {
  sub: string
  email: string
  role: 'customer' | 'vendor' | 'admin'
}

const COOKIE_NAME = 'repairex_session'

/**
 * @description Returns the HTTP-only session cookie name.
 * @returns {string} Cookie key.
 */
export function getSessionCookieName(): string {
  return COOKIE_NAME
}

/**
 * @description Signs a JWT session token for the authenticated user.
 * @param {SessionPayload} payload - User identity claims.
 * @returns {string} Signed JWT.
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.SESSION_SECRET, {
    expiresIn: '7d',
  })
}

/**
 * @description Verifies a session JWT and returns claims when valid.
 * @param {string} token - Cookie JWT value.
 * @returns {SessionPayload | null} Parsed payload or null when invalid/expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET) as SessionPayload
    if (!decoded.sub || !decoded.email || !decoded.role) {
      return null
    }
    return decoded
  } catch {
    return null
  }
}

/**
 * @description Cookie options for the session token.
 * @returns {object} Express cookie configuration.
 */
export function getSessionCookieOptions(): {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  maxAge: number
  path: string
} {
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000

  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  }
}
