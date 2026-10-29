import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/**
 * @description Hashes a plaintext password for storage.
 * @async
 * @param {string} password - Raw password.
 * @returns {Promise<string>} Bcrypt hash.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * @description Compares a plaintext password with a stored hash.
 * @async
 * @param {string} password - Raw password attempt.
 * @param {string} hash - Stored bcrypt hash.
 * @returns {Promise<boolean>} True when the password matches.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
