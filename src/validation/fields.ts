import { z } from 'zod'

/** @description Unicode-friendly personal names (letters, marks, spaces, hyphen, apostrophe). */
const PERSON_NAME_REGEX = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*[\p{L}\p{M}]$|^[\p{L}\p{M}]$/u

/** @description Device brand/model labels — letters, numbers, common punctuation. */
const DEVICE_LABEL_REGEX = /^[\p{L}\p{N}\s+\-_.#/()]+$/u

/** @description Optional phone — digits and common separators only (not coerced to number). */
const PHONE_CHARS_REGEX = /^[\d+\s().-]+$/

/**
 * @description Person display name (customer, vendor, contact).
 */
export const personNameField = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(80, 'Name cannot exceed 80 characters.')
  .regex(PERSON_NAME_REGEX, 'Use letters and common name punctuation only.')
  .refine((value) => !/\d/.test(value), {
    message: 'Names cannot contain numbers.',
  })

/**
 * @description Normalized email (format only — does not verify mailbox exists).
 */
export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(120, 'Email is too long.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase())

/**
 * @description Six-digit OTP as string (preserves leading zeros).
 */
export const otpField = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code.')

/** @description Password rules aligned with the signup UI copy. */
export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/\d/, 'Include at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Include at least one special character.')

/**
 * @description Optional contact phone (max 24 chars, separator-safe).
 */
export const optionalPhoneField = z
  .string()
  .trim()
  .max(24, 'Phone number is too long.')
  .optional()
  .transform((value) => (value === '' ? undefined : value))
  .refine((value) => value === undefined || PHONE_CHARS_REGEX.test(value), {
    message: 'Use digits and phone separators only (+, spaces, hyphens).',
  })

/**
 * @description Long free-text (descriptions, diagnostics, messages).
 */
export function longTextField(min: number, max: number, label = 'Text') {
  return z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} cannot exceed ${max} characters.`)
}

/**
 * @description Short label (turnaround, completion estimate).
 */
export function shortLabelField(max = 100) {
  return z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters.')
    .max(max, `Cannot exceed ${max} characters.`)
}

export const deviceBrandField = z
  .string()
  .trim()
  .min(1, 'Device brand is required.')
  .max(60, 'Brand name cannot exceed 60 characters.')
  .regex(DEVICE_LABEL_REGEX, 'Brand contains invalid characters.')

export const deviceModelField = z
  .string()
  .trim()
  .min(1, 'Device model is required.')
  .max(100, 'Model name cannot exceed 100 characters.')
  .regex(DEVICE_LABEL_REGEX, 'Model contains invalid characters.')

/**
 * @description Non-negative money amount from JSON number.
 */
export const nonNegativeMoneyField = z.coerce
  .number({ error: 'Enter a valid amount.' })
  .min(0, 'Amount cannot be negative.')

/**
 * @description Strictly positive money amount from JSON number.
 */
export const positiveMoneyField = z.coerce
  .number({ error: 'Enter a valid amount.' })
  .positive('Amount must be greater than zero.')

/**
 * @description Optional decline / feedback text.
 */
export const optionalFeedbackField = z
  .string()
  .trim()
  .max(1000, 'Feedback cannot exceed 1000 characters.')
  .optional()
  .transform((value) => (value === '' ? undefined : value))
