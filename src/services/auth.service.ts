import { env } from '../config/env.js'
import {
  createUser,
  deleteOtpChallenge,
  findUserByEmail,
  getOtpChallenge,
  markEmailVerified,
  saveOtpChallenge,
  updateUserPasswordHash,
  type OtpPurpose,
} from '../repositories/auth.repository.js'
import { AppError } from '../utils/AppError.js'
import { generateOtpCode, hashOtp, verifyOtpHash } from '../utils/otp.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { sendTransactionalEmail } from './email.service.js'
import {
  getSessionCookieName,
  getSessionCookieOptions,
  signSessionToken,
  type SessionPayload,
} from './session.service.js'

const RESEND_COOLDOWN_MS = 60_000
const lastOtpSentAt = new Map<string, number>()

/**
 * @description Ensures OTP resend cooldown is respected per email/purpose.
 * @param {string} email - Normalized email.
 * @param {OtpPurpose} purpose - OTP flow.
 * @returns {void}
 * @throws {AppError} When resend is too soon.
 */
function assertOtpCooldown(email: string, purpose: OtpPurpose): void {
  const key = `${email}:${purpose}`
  const last = lastOtpSentAt.get(key)
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
    throw new AppError(
      'Please wait a minute before requesting another code.',
      429,
    )
  }
  lastOtpSentAt.set(key, Date.now())
}

/**
 * @description Creates and emails an OTP challenge.
 * @async
 * @param {string} email - Recipient email.
 * @param {OtpPurpose} purpose - Signup or reset flow.
 * @returns {Promise<void>}
 */
async function issueOtp(email: string, purpose: OtpPurpose): Promise<void> {
  const normalized = email.toLowerCase().trim()
  assertOtpCooldown(normalized, purpose)

  const code = generateOtpCode(6)
  const expiresAt = new Date(
    Date.now() + env.OTP_EXPIRES_MINUTES * 60 * 1000,
  )

  await saveOtpChallenge({
    email: normalized,
    purpose,
    hash: hashOtp(code),
    expiresAt,
  })

  const subject =
    purpose === 'signup'
      ? 'Verify your Repairex account'
      : 'Reset your Repairex password'

  await sendTransactionalEmail({
    to: normalized,
    subject,
    text: `Your Repairex verification code is ${code}. It expires in ${env.OTP_EXPIRES_MINUTES} minutes.`,
  })
}

/**
 * @description Registers a new user and sends a signup OTP.
 * @async
 * @param {object} input - Signup payload.
 * @returns {Promise<{ message: string }>} Success message.
 */
export async function registerUser(input: {
  fullName: string
  email: string
  password: string
  role: 'customer' | 'vendor'
}): Promise<{ message: string }> {
  const normalized = input.email.toLowerCase().trim()
  const existing = await findUserByEmail(normalized)

  if (existing?.emailVerified) {
    throw new AppError('An account with this email already exists.', 409)
  }

  if (existing && !existing.emailVerified) {
    await issueOtp(normalized, 'signup')
    return {
      message:
        'We sent a new verification code to your email. Enter it to finish creating your account.',
    }
  }

  const passwordHash = await hashPassword(input.password)
  await createUser({
    fullName: input.fullName,
    email: normalized,
    passwordHash,
    role: input.role,
  })

  await issueOtp(normalized, 'signup')

  return {
    message:
      'Account created. Check your email for a 6-digit code to verify your address.',
  }
}

/**
 * @description Verifies signup OTP and returns session payload.
 * @async
 * @param {string} email - User email.
 * @param {string} otp - Six-digit code.
 * @returns {Promise<SessionPayload>} Session claims for cookie.
 */
export async function verifySignupOtp(
  email: string,
  otp: string,
): Promise<SessionPayload> {
  const normalized = email.toLowerCase().trim()
  const user = await findUserByEmail(normalized)

  if (!user) {
    throw new AppError('Invalid verification request.', 400)
  }

  if (user.emailVerified) {
    throw new AppError('This email is already verified. You can log in.', 400)
  }

  const challenge = await getOtpChallenge(normalized, 'signup')
  if (!challenge || !verifyOtpHash(otp, challenge.hash)) {
    throw new AppError('Invalid or expired verification code.', 400)
  }

  await deleteOtpChallenge(normalized, 'signup')
  const updated = await markEmailVerified(user.id)
  if (!updated) {
    throw new AppError('Unable to verify account.', 500)
  }

  return {
    sub: updated.id,
    email: updated.email,
    role: updated.role,
  }
}

/**
 * @description Authenticates a verified user with email and password.
 * @async
 * @param {string} email - Login email.
 * @param {string} password - Login password.
 * @returns {Promise<SessionPayload>} Session claims.
 */
export async function loginUser(
  email: string,
  password: string,
): Promise<SessionPayload> {
  const normalized = email.toLowerCase().trim()
  const user = await findUserByEmail(normalized)

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError('Invalid email or password.', 401)
  }

  if (!user.emailVerified) {
    try {
      await issueOtp(normalized, 'signup')
    } catch {
      // Cooldown active; existing OTP challenge remains valid
    }
    throw new AppError(
      'Verify your email first. Enter the 6-digit code sent to your inbox.',
      403,
    )
  }

  return {
    sub: user.id,
    email: user.email,
    role: user.role,
  }
}

/**
 * @description Starts password reset by emailing an OTP (no account enumeration leak in message).
 * @async
 * @param {string} email - Account email.
 * @returns {Promise<{ message: string }>} Generic success copy.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ message: string }> {
  const normalized = email.toLowerCase().trim()
  const user = await findUserByEmail(normalized)

  if (user?.emailVerified) {
    await issueOtp(normalized, 'reset')
  }

  return {
    message:
      'If an account exists for that email, we sent a 6-digit reset code.',
  }
}

/**
 * @description Resets password after OTP verification.
 * @async
 * @param {object} input - Email, OTP, and new password.
 * @returns {Promise<{ message: string }>} Success message.
 */
export async function resetPasswordWithOtp(input: {
  email: string
  otp: string
  password: string
}): Promise<{ message: string }> {
  const normalized = input.email.toLowerCase().trim()
  const user = await findUserByEmail(normalized)

  if (!user?.emailVerified) {
    throw new AppError('Invalid or expired reset code.', 400)
  }

  const challenge = await getOtpChallenge(normalized, 'reset')
  if (!challenge || !verifyOtpHash(input.otp, challenge.hash)) {
    throw new AppError('Invalid or expired reset code.', 400)
  }

  const passwordHash = await hashPassword(input.password)
  await updateUserPasswordHash(user.id, passwordHash)
  await deleteOtpChallenge(normalized, 'reset')

  return { message: 'Password updated. You can log in with your new password.' }
}

/**
 * @description Resends an OTP for signup or reset flows.
 * @async
 * @param {string} email - User email.
 * @param {OtpPurpose} purpose - Flow type.
 * @returns {Promise<{ message: string }>} Success message.
 */
export async function resendOtp(
  email: string,
  purpose: OtpPurpose,
): Promise<{ message: string }> {
  const normalized = email.toLowerCase().trim()
  const user = await findUserByEmail(normalized)

  if (purpose === 'signup') {
    if (!user || user.emailVerified) {
      throw new AppError('Unable to resend verification code.', 400)
    }
  } else if (!user?.emailVerified) {
    throw new AppError('Unable to resend reset code.', 400)
  }

  await issueOtp(normalized, purpose)

  return { message: 'We sent a new 6-digit code to your email.' }
}

export {
  getSessionCookieName,
  getSessionCookieOptions,
  signSessionToken,
}
