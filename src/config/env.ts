import 'dotenv/config'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.preprocess(emptyToUndefined, z.string().url().optional()),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
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
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().email().optional()),
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_CALLBACK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
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
