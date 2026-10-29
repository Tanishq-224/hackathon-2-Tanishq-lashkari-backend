import nodemailer from 'nodemailer'

import { env } from '../config/env.js'

/**
 * @description Sends a transactional email with real SMTP delivery or dev console fallback.
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
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    console.info('[email:dev-fallback] No SMTP configured. Printing to console:', { to, subject, text })
    return
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  })

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html: html ?? text,
    })
    console.info(`[email] Successfully delivered email to ${to} (Message ID: ${info.messageId})`)
  } catch (error) {
    console.error(`[email:error] Failed to send email via ${env.SMTP_HOST}:`, error)
    // Dev fallback print so OTP is never lost during dev errors
    console.info('[email:dev-fallback]', { to, subject, text })
    throw error
  }
}
