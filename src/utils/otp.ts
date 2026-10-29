import crypto from 'node:crypto'

/**
 * @description Generates a numeric OTP code of fixed length.
 * @param {number} [length=6] - Number of digits.
 * @returns {string} OTP string.
 */
export function generateOtpCode(length = 6): string {
  const max = 10 ** length
  const value = crypto.randomInt(0, max)
  return value.toString().padStart(length, '0')
}

/**
 * @description Hashes an OTP for persistence (never store plaintext OTPs).
 * @param {string} code - OTP digits.
 * @returns {string} SHA-256 hex digest.
 */
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

/**
 * @description Checks an OTP against a stored hash.
 * @param {string} code - User-entered OTP.
 * @param {string} hash - Stored OTP hash.
 * @returns {boolean} True when the code matches.
 */
export function verifyOtpHash(code: string, hash: string): boolean {
  return hashOtp(code) === hash
}
