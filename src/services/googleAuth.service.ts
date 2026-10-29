import { OAuth2Client, type TokenPayload } from 'google-auth-library'

import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

let defaultOAuth2Client: OAuth2Client | null = null
let customTokenVerifier: ((idToken: string) => Promise<VerifiedGoogleUser>) | null = null

/**
 * @description Injects a custom verifier function (used in automated unit test environments).
 */
export function setCustomGoogleVerifier(
  verifier: ((idToken: string) => Promise<VerifiedGoogleUser>) | null,
): void {
  customTokenVerifier = verifier
}

function getOAuth2Client(): OAuth2Client {
  if (!defaultOAuth2Client) {
    defaultOAuth2Client = new OAuth2Client(env.GOOGLE_CLIENT_ID)
  }
  return defaultOAuth2Client
}

export type VerifiedGoogleUser = {
  googleId: string
  email: string
  name: string
  emailVerified: boolean
  picture?: string
}

/**
 * @description Verifies a Google ID token (JWT) using the official google-auth-library.
 * Validates cryptographic signature, expiry, audience, and email_verified status.
 * Never trusts unverified client-provided profile data.
 * @async
 * @param {string} idToken - The Google JWT credential from Google Identity Services.
 * @param {OAuth2Client} [customClient] - Optional injected client (used in unit tests).
 * @returns {Promise<VerifiedGoogleUser>} Verified user details.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  customClient?: OAuth2Client,
): Promise<VerifiedGoogleUser> {
  if (customTokenVerifier) {
    return customTokenVerifier(idToken)
  }

  const clientId = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID

  if (!clientId) {
    throw new AppError(
      'Google authentication is not configured on this server (missing GOOGLE_CLIENT_ID).',
      500,
    )
  }

  const client = customClient ?? getOAuth2Client()

  let payload: TokenPayload | undefined

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    })
    payload = ticket.getPayload()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('audience') || message.includes('Recipient')) {
      throw new AppError(
        'Google token audience mismatch. The token was not issued for this application.',
        401,
      )
    }
    throw new AppError('Invalid or expired Google ID token.', 401)
  }

  if (!payload) {
    throw new AppError('Google token verification failed (missing payload).', 401)
  }

  // 1. Audience verification (strict check)
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(clientId)) {
    throw new AppError(
      'Google token audience mismatch. The token was not issued for this application.',
      401,
    )
  }

  // 2. Verified email check
  if (!payload.email) {
    throw new AppError('Google ID token did not include an email address.', 400)
  }

  if (payload.email_verified !== true) {
    throw new AppError(
      'The email associated with this Google account is not verified by Google.',
      400,
    )
  }

  if (!payload.sub) {
    throw new AppError('Google ID token did not include a valid subject ID.', 400)
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name?.trim() || 'Repairex User',
    emailVerified: true,
    picture: payload.picture,
  }
}
