import nodemailer from 'nodemailer'

import { env } from '../config/env.js'

/**
 * @description Sends a transactional email or logs OTP in development when SMTP is unset.
 * @async
 * @param {object} params - Recipient and message body.
 * @param {string} params.to - Destination email.
 * @param {string} params.subject - Email subject line.
 * @param {string} params.text - Plain-text body.
 * @returns {Promise<void>}
 */
export async function sendTransactionalEmail({
  to,
  subject,
  text,
}: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    console.info('[email:dev-fallback]', { to, subject, text })
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

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
  })
}
