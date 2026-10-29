import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env from cwd first, fallback to package root
dotenv.config({ quiet: true })
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true })

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://repairex-client.vercel.app',
  'http://localhost:5173',
  'http://localhost:5000',
]

/**
 * @description Parses comma-separated origin strings into a clean array including defaults.
 * @param {string} [clientUrl] - Configured CLIENT_URL from environment.
 * @returns {string[]} Deduplicated list of allowed origins without trailing slashes.
 */
export function getAllowedOrigins(clientUrl?: string): string[] {
  const origins = new Set<string>(DEFAULT_ALLOWED_ORIGINS)

  if (clientUrl) {
    clientUrl
      .split(',')
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter((item) => item.length > 0)
      .forEach((item) => origins.add(item))
  }

  return Array.from(origins)
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.preprocess(emptyToUndefined, z.string().optional()),
    CLIENT_URL: z
      .string()
      .default('https://repairex-client.vercel.app,http://localhost:5173'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    SESSION_SECRET: z
      .string()
      .min(16)
      .default('dev-only-change-session-secret-min-16'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    OTP_EXPIRES_MINUTES: z.coerce.number().int().positive().default(10),
    SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PORT: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().positive().optional(),
    ),
    SMTP_SECURE: z.preprocess((val) => {
      if (val === 'true' || val === true) return true
      if (val === 'false' || val === false) return false
      return undefined
    }, z.boolean().optional()),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_FROM: z.preprocess(emptyToUndefined, z.string().optional()),
    RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    GOOGLE_CALLBACK_URL: z.preprocess(emptyToUndefined, z.string().optional()),
    CLOUDINARY_CLOUD_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
    CLOUDINARY_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    CLOUDINARY_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.MONGODB_URI) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message:
            'MONGODB_URI is required in production environment (must be a valid cloud connection, e.g. MongoDB Atlas).',
        })
      } else if (
        data.MONGODB_URI.includes('localhost') ||
        data.MONGODB_URI.includes('127.0.0.1')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message:
            'MONGODB_URI cannot point to localhost or 127.0.0.1 in production. A production cloud MongoDB URI is required.',
        })
      }

      if (data.SESSION_SECRET === 'dev-only-change-session-secret-min-16') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message:
            'SESSION_SECRET must be set to a secure, random string (min 16 chars) in production.',
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

/**
 * @description Validates process environment variables at startup.
 * @returns {Env} Parsed environment configuration.
 * @throws {Error} When required variables are missing or invalid.
 */
export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid environment configuration: ${details}`)
  }

  return parsed.data
}

/** @description Application environment loaded once for the process. */
export const env = loadEnv()
