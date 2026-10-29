import nodemailer, { type Transporter } from 'nodemailer'

import { env } from '../config/env.js'

let cachedTransporter: Transporter | null = null

/**
 * @description Masks an email address for safe logging without exposing personal or secret data.
 * @param {string} email - Email to mask.
 * @returns {string} Masked string (e.g. "te***@gmail.com").
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 2) {
    return `***${email.slice(Math.max(0, atIndex))}`
  }
  return `${email.slice(0, 2)}***${email.slice(atIndex)}`
}

/**
 * @description Checks whether all essential SMTP credentials are provided in the environment.
 * @returns {boolean} True if SMTP delivery can be attempted.
 */
export function isSmtpConfigured(): boolean {
  return Boolean(
    env.SMTP_HOST &&
      env.SMTP_USER &&
      env.SMTP_PASS &&
      env.SMTP_FROM,
  )
}

/**
 * @description Returns safe non-sensitive SMTP configuration metadata.
 * @returns {object} Safe metadata.
 */
export function getSafeSmtpConfig(): {
  host?: string
  port?: number
  secure?: boolean
  user?: string
  from?: string
  configured: boolean
} {
  const port = env.SMTP_PORT ?? 465
  const secure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE : port === 465

  return {
    host: env.SMTP_HOST,
    port,
    secure,
    user: env.SMTP_USER ? maskEmail(env.SMTP_USER) : undefined,
    from: env.SMTP_FROM ? maskEmail(env.SMTP_FROM) : undefined,
    configured: isSmtpConfigured(),
  }
}

/**
 * @description Returns a singleton nodemailer transporter configured from environment variables.
 * @returns {nodemailer.Transporter | null} Active transporter or null if unconfigured.
 */
export function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) {
    return null
  }

  if (cachedTransporter) {
    return cachedTransporter
  }

  const port = env.SMTP_PORT ?? 465
  const secure = env.SMTP_SECURE !== undefined ? env.SMTP_SECURE : port === 465

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })

  return cachedTransporter
}

/**
 * @description Verifies SMTP connectivity with the mail server on startup.
 * @async
 * @returns {Promise<boolean>} True if connection verified.
 */
export async function verifySmtpConnection(): Promise<boolean> {
  if (env.NODE_ENV === 'test') {
    return true
  }

  const safeConfig = getSafeSmtpConfig()

  if (!safeConfig.configured) {
    console.info(
      '[email:info] SMTP is not fully configured (missing SMTP_HOST, SMTP_USER, SMTP_PASS, or SMTP_FROM). Console fallback enabled.',
    )
    return false
  }

  const transporter = getTransporter()
  if (!transporter) {
    return false
  }

  try {
    await transporter.verify()
    console.info(
      `[email] SMTP server connection verified (host: ${safeConfig.host}:${safeConfig.port}, secure: ${safeConfig.secure}, user: ${safeConfig.user})`,
    )
    return true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[email:error] SMTP verification failed for ${safeConfig.host}: ${message}`)
    return false
  }
}

/**
 * @description Sends a transactional email with real SMTP delivery or test/dev fallback.
 * @async
 * @param {object} params - Recipient and message body.
 * @param {string} params.to - Destination email.
 * @param {string} params.subject - Email subject line.
 * @param {string} params.text - Plain-text body.
 * @param {string} [params.html] - Optional styled HTML email.
 * @returns {Promise<void>}
 */
export async function sendTransactionalEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<void> {
  // In automated Jest test environments or when SMTP credentials are not configured,
  // log to console so tests and offline dev work without crashing or sending live emails.
  if (env.NODE_ENV === 'test' || !isSmtpConfigured()) {
    console.info('[email:dev-fallback] No SMTP configured. Printing to console:', {
      to,
      subject,
      text,
    })
    return
  }

  const transporter = getTransporter()
  if (!transporter) {
    throw new Error('SMTP transporter is unconfigured.')
  }

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html: html ?? text,
    })
    console.info(
      `[email] Successfully delivered email to ${to} (Message ID: ${info.messageId})`,
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[email:error] Failed to send email to ${to} via ${env.SMTP_HOST}: ${message}`)
    throw error
  }
}
