import dns from 'node:dns/promises'
import nodemailer, { type Transporter } from 'nodemailer'

import { env } from '../config/env.js'

let cachedTransporter: Transporter | null = null

/**
 * @description Masks an email address for safe logging without exposing personal or secret data.
 * @param {string} email - Email to mask.
 * @returns {string} Masked string (e.g. "la***@gmail.com").
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 2) {
    return `***${email.slice(Math.max(0, atIndex))}`
  }
  return `${email.slice(0, 2)}***${email.slice(atIndex)}`
}

/**
 * @description Determines whether TLS should be used based on port and explicit configuration.
 * - Port 465: implicit TLS (secure = true)
 * - Port 587, 2525, 25: STARTTLS upgrade (secure = false)
 * @param {number} port - SMTP destination port.
 * @param {boolean} [configuredSecure] - Optional explicitly configured SMTP_SECURE boolean.
 * @returns {boolean} Whether nodemailer should connect with implicit TLS.
 */
export function resolveSmtpSecure(
  port: number,
  configuredSecure?: boolean,
): boolean {
  if (configuredSecure !== undefined) {
    return configuredSecure
  }
  return port === 465
}

/**
 * @description Checks whether standard SMTP credentials are provided in the environment.
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
 * @description True when the app is running on Render (outbound SMTP is usually blocked).
 * @returns {boolean}
 */
export function isRunningOnRender(): boolean {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID)
}

/**
 * @description Gmail/default SMTP ports blocked on many PaaS hosts (Render free tier).
 * @returns {boolean}
 */
export function isCloudBlockedSmtpPort(port = env.SMTP_PORT ?? 465): boolean {
  return port === 465 || port === 587 || port === 25
}

/**
 * @description Whether SMTP should not be used on this host (use Resend HTTPS instead).
 * @returns {boolean}
 */
export function isSmtpBlockedOnCurrentHost(): boolean {
  return isRunningOnRender() && isCloudBlockedSmtpPort() && !env.RESEND_API_KEY
}

/**
 * @description Checks whether any valid transactional email transport (SMTP or Resend API) is configured.
 * @returns {boolean} True if email can be sent.
 */
export function isEmailConfigured(): boolean {
  if (env.RESEND_API_KEY) {
    return true
  }

  if (isSmtpBlockedOnCurrentHost()) {
    return false
  }

  return isSmtpConfigured()
}

/**
 * @description Returns safe non-sensitive SMTP configuration metadata.
 * @returns {object} Safe metadata without secrets.
 */
export function getSafeSmtpConfig(): {
  host?: string
  port?: number
  secure?: boolean
  user?: string
  from?: string
  provider: 'smtp' | 'resend-api' | 'none'
  configured: boolean
} {
  const port = env.SMTP_PORT ?? 465
  const secure = resolveSmtpSecure(port, env.SMTP_SECURE)

  let provider: 'smtp' | 'resend-api' | 'none' = 'none'
  if (env.RESEND_API_KEY) {
    provider = 'resend-api'
  } else if (isSmtpConfigured()) {
    provider = 'smtp'
  }

  return {
    host: env.SMTP_HOST,
    port,
    secure,
    user: env.SMTP_USER ? maskEmail(env.SMTP_USER) : undefined,
    from: env.SMTP_FROM ? maskEmail(env.SMTP_FROM) : undefined,
    provider,
    configured: isEmailConfigured(),
  }
}

/**
 * @description Safely performs a DNS lookup on the target SMTP host with a strict timeout.
 * @async
 * @param {string} host - Hostname to resolve.
 * @param {number} [timeoutMs=3000] - Lookup timeout in milliseconds.
 * @returns {Promise<{ ok: boolean; ip?: string; error?: string }>}
 */
async function checkDnsResolution(
  host: string,
  timeoutMs = 3000,
): Promise<{ ok: boolean; ip?: string; error?: string }> {
  try {
    const lookupPromise = dns.lookup(host)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs)
    })
    const res = await Promise.race([lookupPromise, timeoutPromise])
    return { ok: true, ip: res.address }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * @description Returns a singleton nodemailer transporter configured from environment variables.
 * @returns {Transporter | null} Active transporter or null if unconfigured.
 */
export function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) {
    return null
  }

  if (cachedTransporter) {
    return cachedTransporter
  }

  const port = env.SMTP_PORT ?? 465
  const secure = resolveSmtpSecure(port, env.SMTP_SECURE)

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    // Strict connection timeouts so cloud network blocks fail fast instead of hanging
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  })

  return cachedTransporter
}

/**
 * @description Verifies email transport connectivity on startup with DNS diagnostics.
 * @async
 * @returns {Promise<boolean>} True if connection verified.
 */
export async function verifyEmailTransport(): Promise<boolean> {
  if (env.NODE_ENV === 'test') {
    return true
  }

  // 1. Resend API mode (HTTPS — works on Render/Vercel)
  if (env.RESEND_API_KEY) {
    console.info(
      `[email] Resend HTTP API configured (uses HTTPS port 443, Render firewall-safe). Sender: ${
        env.SMTP_FROM ? maskEmail(env.SMTP_FROM) : 'Repairex <onboarding@resend.dev>'
      }`,
    )
    return true
  }

  if (isSmtpBlockedOnCurrentHost()) {
    console.warn(
      '[email:diagnostic] Render blocks outbound SMTP on ports 465/587/25. Skipping SMTP verify.\n' +
        '[email:diagnostic] Add RESEND_API_KEY + SMTP_FROM in Render env for lifecycle emails (HTTPS, no firewall block).\n' +
        '[email:diagnostic] In-app notifications still work; email will use server log fallback until Resend is set.',
    )
    return false
  }

  const safeConfig = getSafeSmtpConfig()

  if (!safeConfig.configured) {
    console.info(
      '[email:info] No email transport configured (missing SMTP_HOST/USER/PASS/FROM or RESEND_API_KEY). Dev console fallback active.',
    )
    return false
  }

  if (!safeConfig.host) {
    return false
  }

  // 2. DNS Resolution Diagnostic Check
  const dnsCheck = await checkDnsResolution(safeConfig.host, 3000)
  if (!dnsCheck.ok) {
    console.error(
      `[email:diagnostic] DNS resolution failed for host "${safeConfig.host}": ${dnsCheck.error}`,
    )
    return false
  }

  // 3. Nodemailer SMTP Verification
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
    console.error(
      `[email:error] SMTP verification failed for ${safeConfig.host}:${safeConfig.port}: ${message}`,
    )

    // Render / Cloud hosting firewall diagnostic
    const isTimeout =
      message.toLowerCase().includes('timeout') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNREFUSED')

    if (isTimeout) {
      console.warn(
        `[email:diagnostic] ⚠️ Outbound connection timed out to ${safeConfig.host}:${safeConfig.port}.\n` +
          `[email:diagnostic] Cause: Cloud hosting platforms (like Render Free Tier) intentionally block outbound TCP traffic on ports 25, 465, and 587 to prevent spam.\n` +
          `[email:diagnostic] Recommended Solutions:\n` +
          `  1. (Easiest & Free) Use Resend HTTP API: Set RESEND_API_KEY=<key> in Render environment variables (works via HTTPS port 443 with 0 firewall issues).\n` +
          `  2. Or use Brevo / SendGrid on port 2525 (SMTP_PORT=2525, SMTP_SECURE=false).\n` +
          `  3. Or upgrade Render service to a paid compute plan to unblock outbound SMTP ports 465 & 587.`,
      )
    }

    return false
  }
}

/**
 * @description Sends transactional email via Resend HTTP API (HTTPS port 443).
 * @async
 */
async function sendViaResendApi({
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
  const from = env.SMTP_FROM || 'Repairex <onboarding@resend.dev>'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: html ?? text,
    }),
  })

  if (!response.ok) {
    let errorDetail = ''
    try {
      const errJson = (await response.json()) as { message?: string }
      errorDetail = errJson.message ?? JSON.stringify(errJson)
    } catch {
      errorDetail = response.statusText
    }
    throw new Error(`Resend API error (${response.status}): ${errorDetail}`)
  }

  const data = (await response.json()) as { id?: string }
  console.info(
    `[email] Delivered email via Resend API to ${maskEmail(to)} (ID: ${data.id ?? 'ok'})`,
  )
}

/**
 * @description Sends a transactional email with real delivery (Resend API or SMTP) or test/dev fallback.
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
  // In automated Jest test environments or when no email transport is configured,
  // log to console so tests and offline dev work without crashing or sending live emails.
  if (env.NODE_ENV === 'test' || !isEmailConfigured()) {
    console.info('[email:dev-fallback] No email transport configured. Printing to console:', {
      to: maskEmail(to),
      subject,
      text,
    })
    return
  }

  // 1. Resend HTTP API Delivery (HTTPS Port 443 — firewall safe)
  if (env.RESEND_API_KEY) {
    try {
      await sendViaResendApi({ to, subject, text, html })
      return
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[email:error] Failed to send email via Resend API to ${maskEmail(to)}: ${message}`)
      throw error
    }
  }

  if (isSmtpBlockedOnCurrentHost()) {
    console.info('[email:render-fallback] SMTP blocked on Render — logging email to console:', {
      to: maskEmail(to),
      subject,
      text,
    })
    return
  }

  // 2. SMTP Delivery (Nodemailer)
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
      `[email] Successfully delivered email to ${maskEmail(to)} (Message ID: ${info.messageId})`,
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[email:error] Failed to send email to ${maskEmail(to)} via ${env.SMTP_HOST}:${env.SMTP_PORT ?? 465}: ${message}`,
    )
    throw error
  }
}

/** @deprecated Use {@link verifyEmailTransport} */
export const verifySmtpConnection = verifyEmailTransport
