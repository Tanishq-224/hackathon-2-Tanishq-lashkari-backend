import crypto from 'node:crypto'

import mongoose from 'mongoose'

import { OtpModel } from '../models/Otp.model.js'
import { UserModel, type UserDocument } from '../models/User.model.js'

export type UserRole = 'customer' | 'vendor'

export type AuthUserRecord = {
  id: string
  fullName: string
  email: string
  passwordHash: string
  role: UserRole
  emailVerified: boolean
}

export type OtpPurpose = 'signup' | 'reset'

type MemoryOtp = {
  hash: string
  expiresAt: Date
  purpose: OtpPurpose
}

const memoryUsers = new Map<string, AuthUserRecord>()
const memoryOtps = new Map<string, MemoryOtp>()

/**
 * @description Builds a map key for OTP storage.
 * @param {string} email - Normalized email.
 * @param {OtpPurpose} purpose - Signup or password reset flow.
 * @returns {string} Storage key.
 */
function otpKey(email: string, purpose: OtpPurpose): string {
  return `${email.toLowerCase()}:${purpose}`
}

/**
 * @description Whether auth should use the in-memory store (no live Mongo connection).
 * @returns {boolean} True for memory mode.
 */
export function isMemoryAuthStore(): boolean {
  return mongoose.connection.readyState !== 1
}

/**
 * @description Clears in-memory auth data (tests only).
 * @returns {void}
 */
export function clearMemoryAuthStore(): void {
  memoryUsers.clear()
  memoryOtps.clear()
}

/**
 * @description Maps a Mongo user document to a plain auth record.
 * @param {UserDocument} doc - Mongoose user.
 * @returns {AuthUserRecord} Plain user.
 */
function fromMongo(doc: UserDocument): AuthUserRecord {
  return {
    id: doc._id.toString(),
    fullName: doc.fullName,
    email: doc.email,
    passwordHash: doc.passwordHash ?? '',
    role: doc.role as UserRole,
    emailVerified: doc.emailVerified,
  }
}

/**
 * @description Finds a user by email address.
 * @async
 * @param {string} email - Email to lookup.
 * @returns {Promise<AuthUserRecord | null>} User or null.
 */
export async function findUserByEmail(
  email: string,
): Promise<AuthUserRecord | null> {
  const normalized = email.toLowerCase().trim()

  if (isMemoryAuthStore()) {
    return memoryUsers.get(normalized) ?? null
  }

  const doc = await UserModel.findOne({ email: normalized })
  return doc ? fromMongo(doc) : null
}

/**
 * @description Creates a new unverified user record.
 * @async
 * @param {object} input - User fields.
 * @returns {Promise<AuthUserRecord>} Created user.
 */
export async function createUser(input: {
  fullName: string
  email: string
  passwordHash: string
  role: UserRole
}): Promise<AuthUserRecord> {
  const normalized = input.email.toLowerCase().trim()

  if (isMemoryAuthStore()) {
    const record: AuthUserRecord = {
      id: crypto.randomUUID(),
      fullName: input.fullName.trim(),
      email: normalized,
      passwordHash: input.passwordHash,
      role: input.role,
      emailVerified: false,
    }
    memoryUsers.set(normalized, record)
    return record
  }

  const doc = await UserModel.create({
    fullName: input.fullName.trim(),
    email: normalized,
    passwordHash: input.passwordHash,
    role: input.role,
    emailVerified: false,
  })

  return fromMongo(doc)
}

/**
 * @description Marks a user's email as verified.
 * @async
 * @param {string} userId - User id.
 * @returns {Promise<AuthUserRecord | null>} Updated user.
 */
export async function markEmailVerified(
  userId: string,
): Promise<AuthUserRecord | null> {
  if (isMemoryAuthStore()) {
    for (const [email, user] of memoryUsers.entries()) {
      if (user.id === userId) {
        const updated = { ...user, emailVerified: true }
        memoryUsers.set(email, updated)
        return updated
      }
    }
    return null
  }

  const doc = await UserModel.findByIdAndUpdate(
    userId,
    { emailVerified: true },
    { returnDocument: 'after' },
  )
  return doc ? fromMongo(doc) : null
}

/**
 * @description Updates a user's password hash.
 * @async
 * @param {string} userId - User id.
 * @param {string} passwordHash - New bcrypt hash.
 * @returns {Promise<AuthUserRecord | null>} Updated user.
 */
export async function updateUserPasswordHash(
  userId: string,
  passwordHash: string,
): Promise<AuthUserRecord | null> {
  if (isMemoryAuthStore()) {
    for (const [email, user] of memoryUsers.entries()) {
      if (user.id === userId) {
        const updated = { ...user, passwordHash }
        memoryUsers.set(email, updated)
        return updated
      }
    }
    return null
  }

  const doc = await UserModel.findByIdAndUpdate(
    userId,
    { passwordHash },
    { returnDocument: 'after' },
  )
  return doc ? fromMongo(doc) : null
}

/**
 * @description Persists an OTP challenge hash with expiry.
 * @async
 * @param {object} input - OTP metadata.
 * @returns {Promise<void>}
 */
export async function saveOtpChallenge(input: {
  email: string
  purpose: OtpPurpose
  hash: string
  expiresAt: Date
}): Promise<void> {
  const normalized = input.email.toLowerCase().trim()

  if (isMemoryAuthStore()) {
    const key = otpKey(normalized, input.purpose)
    memoryOtps.set(key, {
      hash: input.hash,
      expiresAt: input.expiresAt,
      purpose: input.purpose,
    })
    return
  }

  await OtpModel.findOneAndUpdate(
    { email: normalized, purpose: input.purpose },
    { hash: input.hash, expiresAt: input.expiresAt },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}

/**
 * @description Loads an OTP challenge if present and not expired.
 * @async
 * @param {string} email - User email.
 * @param {OtpPurpose} purpose - Flow type.
 * @returns {Promise<MemoryOtp | null>} OTP record.
 */
export async function getOtpChallenge(
  email: string,
  purpose: OtpPurpose,
): Promise<MemoryOtp | null> {
  const normalized = email.toLowerCase().trim()

  if (isMemoryAuthStore()) {
    const key = otpKey(normalized, purpose)
    const record = memoryOtps.get(key)
    if (!record) {
      return null
    }
    if (record.expiresAt.getTime() < Date.now()) {
      memoryOtps.delete(key)
      return null
    }
    return record
  }

  const doc = await OtpModel.findOne({ email: normalized, purpose })
  if (!doc) {
    return null
  }
  if (doc.expiresAt.getTime() < Date.now()) {
    await OtpModel.deleteOne({ _id: doc._id })
    return null
  }
  return {
    hash: doc.hash,
    expiresAt: doc.expiresAt,
    purpose: doc.purpose as OtpPurpose,
  }
}

/**
 * @description Removes an OTP challenge after successful verification.
 * @async
 * @param {string} email - User email.
 * @param {OtpPurpose} purpose - Flow type.
 * @returns {Promise<void>}
 */
export async function deleteOtpChallenge(
  email: string,
  purpose: OtpPurpose,
): Promise<void> {
  const normalized = email.toLowerCase().trim()

  if (isMemoryAuthStore()) {
    memoryOtps.delete(otpKey(normalized, purpose))
    return
  }

  await OtpModel.deleteOne({ email: normalized, purpose })
}

/**
 * @description Finds existing account by email or creates a verified Google OAuth account.
 * @async
 * @param {object} input - Google profile attributes.
 * @returns {Promise<AuthUserRecord>} User auth record.
 */
export async function findOrCreateGoogleUser(input: {
  fullName: string
  email: string
  googleId: string
}): Promise<AuthUserRecord> {
  const normalized = input.email.toLowerCase().trim()

  const existing = await findUserByEmail(normalized)
  if (existing) {
    if (!existing.emailVerified) {
      await markEmailVerified(existing.id)
      existing.emailVerified = true
    }
    return existing
  }

  if (isMemoryAuthStore()) {
    const record: AuthUserRecord = {
      id: crypto.randomUUID(),
      fullName: input.fullName.trim() || 'Repairex User',
      email: normalized,
      passwordHash: '',
      role: 'customer',
      emailVerified: true,
    }
    memoryUsers.set(normalized, record)
    return record
  }

  const doc = await UserModel.create({
    fullName: input.fullName.trim() || 'Repairex User',
    email: normalized,
    passwordHash: '',
    role: 'customer',
    googleId: input.googleId,
    emailVerified: true,
  })

  return fromMongo(doc)
}
