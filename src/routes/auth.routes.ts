import { Router } from 'express'

import { asyncHandler } from '../utils/asyncHandler.js'

import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyOtpSchema,
} from '../schemas/auth.schema.js'
import {
  getSessionCookieName,
  getSessionCookieOptions,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendOtp,
  resetPasswordWithOtp,
  signSessionToken,
  verifySignupOtp,
} from '../services/auth.service.js'
import { verifyGoogleIdToken } from '../services/googleAuth.service.js'
import { verifySessionToken } from '../services/session.service.js'
import { AppError } from '../utils/AppError.js'
import {
  findOrCreateGoogleUser,
  findUserByEmail,
} from '../repositories/auth.repository.js'
import { env, getAllowedOrigins } from '../config/env.js'

export const authRouter = Router()

/**
 * @description Registers a customer or vendor and sends email verification OTP.
 */
authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new AppError(issue?.message ?? 'Invalid signup data.', 400)
  }

  const result = await registerUser(parsed.data)
  res.status(201).json({ success: true, ...result })
  }),
)

/**
 * @description Verifies signup OTP and establishes a session cookie.
 */
authRouter.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new AppError(issue?.message ?? 'Invalid verification payload.', 400)
  }

  if (parsed.data.purpose === 'reset') {
    throw new AppError(
      'Use POST /api/auth/reset-password to complete a password reset.',
      400,
    )
  }

  const session = await verifySignupOtp(parsed.data.email, parsed.data.otp)
  const token = signSessionToken(session)

  res
    .cookie(getSessionCookieName(), token, getSessionCookieOptions())
    .json({
      success: true,
      message: 'Email verified. You are now signed in.',
      data: { user: session },
    })
  }),
)

/**
 * @description Logs in with email/password after email verification.
 */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new AppError(issue?.message ?? 'Invalid login data.', 400)
  }

  const session = await loginUser(parsed.data.email, parsed.data.password)
  const token = signSessionToken(session)

  res.cookie(getSessionCookieName(), token, getSessionCookieOptions()).json({
    success: true,
    message: 'Welcome back.',
    data: { user: session },
  })
  }),
)

/**
 * @description Clears the session cookie.
 */
authRouter.post('/logout', (_req, res) => {
  const { maxAge, ...clearOptions } = getSessionCookieOptions()
  res.clearCookie(getSessionCookieName(), clearOptions).json({
    success: true,
    message: 'Logged out.',
  })
})

/**
 * @description Returns the current session user from the HTTP-only cookie.
 */
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
  const token = req.cookies?.[getSessionCookieName()] as string | undefined
  const { maxAge, ...clearOptions } = getSessionCookieOptions()

  if (!token) {
    res.status(401).json({ success: false, message: 'Not authenticated.' })
    return
  }

  const payload = verifySessionToken(token)
  if (!payload) {
    res.clearCookie(getSessionCookieName(), clearOptions)
    res.status(401).json({ success: false, message: 'Session expired.' })
    return
  }

  const user = await findUserByEmail(payload.email)
  if (!user?.emailVerified) {
    res.clearCookie(getSessionCookieName(), clearOptions)
    res.status(401).json({ success: false, message: 'Not authenticated.' })
    return
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    },
  })
  }),
)

/**
 * @description Sends a password reset OTP when the account exists.
 */
authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new AppError(issue?.message ?? 'Invalid email.', 400)
  }

  const result = await requestPasswordReset(parsed.data.email)
  res.json({ success: true, ...result })
  }),
)

/**
 * @description Completes password reset with OTP verification.
 */
authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new AppError(issue?.message ?? 'Invalid reset payload.', 400)
  }

  const result = await resetPasswordWithOtp(parsed.data)
  res.json({ success: true, ...result })
  }),
)

/**
 * @description Resends OTP for signup or reset flows.
 */
authRouter.post(
  '/resend-otp',
  asyncHandler(async (req, res) => {
  const parsed = verifyOtpSchema
    .pick({ email: true, purpose: true })
    .safeParse(req.body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new AppError(issue?.message ?? 'Invalid resend payload.', 400)
  }

  const result = await resendOtp(parsed.data.email, parsed.data.purpose)
  res.json({ success: true, ...result })
  }),
)

/**
 * @description Verifies Google Identity Services ID token (credential), handles account linking safely, and sets session cookie.
 */
authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const parsed = googleAuthSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid Google authentication payload.', 400)
    }

    const verified = await verifyGoogleIdToken(parsed.data.credential)

    const user = await findOrCreateGoogleUser({
      fullName: verified.name,
      email: verified.email,
      googleId: verified.googleId,
    })

    const sessionPayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    }

    const token = signSessionToken(sessionPayload)

    res
      .cookie(getSessionCookieName(), token, getSessionCookieOptions())
      .status(200)
      .json({
        success: true,
        message: 'Google sign-in successful.',
        data: { user: sessionPayload },
      })
  }),
)

/**
 * @description Resolves safe frontend destination for Google OAuth redirects.
 * Validates against allowed origins to prevent open redirects.
 */
function resolveClientRedirectUrl(requestedOrigin?: string): string {
  const allowedOrigins = getAllowedOrigins(env.CLIENT_URL)
  if (requestedOrigin) {
    const clean = requestedOrigin.trim().replace(/\/+$/, '')
    if (allowedOrigins.includes(clean)) {
      return clean
    }
  }

  // Fallback preference: production Vercel app first, else primary configured origin
  const prodOrigin = allowedOrigins.find((o) => o.includes('vercel.app'))
  if (prodOrigin) return prodOrigin
  return allowedOrigins[0] || 'http://localhost:5173'
}

/**
 * @description Initiates Google OAuth redirect or guides setup if credentials are missing.
 */
authRouter.get(
  '/google',
  asyncHandler(async (req, res) => {
    const clientOrigin = (req.query.origin || req.query.state) as string | undefined
    const targetClientUrl = resolveClientRedirectUrl(clientOrigin)

    if (!env.GOOGLE_CLIENT_ID) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'Google OAuth requires GOOGLE_CLIENT_ID configured in backend environment.',
        )}`,
      )
      return
    }

    const callbackUrl =
      env.GOOGLE_CALLBACK_URL ||
      `${req.protocol}://${req.get('host')}/api/auth/google/callback`

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
    googleAuthUrl.searchParams.set('redirect_uri', callbackUrl)
    googleAuthUrl.searchParams.set('response_type', 'code')
    googleAuthUrl.searchParams.set('scope', 'openid email profile')
    googleAuthUrl.searchParams.set('prompt', 'select_account')
    googleAuthUrl.searchParams.set('state', encodeURIComponent(targetClientUrl))

    res.redirect(googleAuthUrl.toString())
  }),
)

/**
 * @description Completes Google OAuth exchange, creates or finds user, and sets session cookie.
 */
authRouter.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const code = req.query.code as string | undefined
    const error = req.query.error as string | undefined
    const state = req.query.state as string | undefined
    const targetClientUrl = resolveClientRedirectUrl(
      state ? decodeURIComponent(state) : undefined,
    )

    if (error || !code) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          error || 'Google authorization was canceled or failed.',
        )}`,
      )
      return
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'Google OAuth credentials missing on backend.',
        )}`,
      )
      return
    }

    const callbackUrl =
      env.GOOGLE_CALLBACK_URL ||
      `${req.protocol}://${req.get('host')}/api/auth/google/callback`

    const tokenParams = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    })

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    if (!tokenResponse.ok) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'Failed to exchange authorization code with Google.',
        )}`,
      )
      return
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string }
    if (!tokenData.access_token) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'Google OAuth did not provide an access token.',
        )}`,
      )
      return
    }

    const profileResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    )

    if (!profileResponse.ok) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'Failed to retrieve Google user profile.',
        )}`,
      )
      return
    }

    const profile = (await profileResponse.json()) as {
      sub: string
      name?: string
      email: string
      email_verified?: boolean
    }

    if (!profile.email) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'Google profile did not contain an email address.',
        )}`,
      )
      return
    }

    if (profile.email_verified !== true) {
      res.redirect(
        `${targetClientUrl}/login?error=${encodeURIComponent(
          'The email associated with this Google account is not verified by Google.',
        )}`,
      )
      return
    }

    const user = await findOrCreateGoogleUser({
      fullName: profile.name || 'Repairex User',
      email: profile.email,
      googleId: profile.sub,
    })

    const sessionPayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    }

    const token = signSessionToken(sessionPayload)

    res
      .cookie(getSessionCookieName(), token, getSessionCookieOptions())
      .redirect(`${targetClientUrl}/dashboard`)
  }),
)
