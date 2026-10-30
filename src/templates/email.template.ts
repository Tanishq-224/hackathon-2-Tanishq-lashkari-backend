import { env } from '../config/env.js'

const BRAND = {
  primary: '#e66418',
  ink: '#25272c',
  canvas: '#f3efe6',
  surface: '#ffffff',
  muted: '#5c6068',
  border: '#e0ded7',
  footerBg: '#0c0d10',
  footerText: '#a8adb8',
} as const

export type EmailCta = {
  label: string
  href: string
}

export type BrandedEmailOptions = {
  preheader?: string
  headline: string
  paragraphs: string[]
  otpCode?: string
  otpExpiresMinutes?: number
  cta?: EmailCta
  footerNote?: string
}

/**
 * @description Escapes user-controlled strings for safe HTML email bodies.
 * @param {string} value - Raw text.
 * @returns {string} HTML-safe string.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * @description Public app origin for logo links (first CLIENT_URL entry).
 * @returns {string}
 */
function getAppOrigin(): string {
  const base = env.CLIENT_URL.split(',')[0]?.trim() || 'http://localhost:5173'
  return base.replace(/\/+$/, '')
}

/**
 * @description Inline SVG mark — no external image host required in email clients.
 * @returns {string} HTML fragment.
 */
function brandMarkHtml(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle;padding-right:10px;">
          <div style="width:36px;height:36px;border-radius:10px;background:${BRAND.primary};text-align:center;line-height:36px;">
            <span style="font-size:18px;color:#ffffff;font-weight:700;">R</span>
          </div>
        </td>
        <td style="vertical-align:middle;">
          <span style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.canvas};">Repairex</span>
        </td>
      </tr>
    </table>
  `.trim()
}

/**
 * @description Wraps transactional content in a consistent Repairex email shell.
 * @param {BrandedEmailOptions} options - Headline, body copy, optional OTP and CTA.
 * @returns {string} Complete HTML document for email clients.
 */
export function buildBrandedEmailHtml(options: BrandedEmailOptions): string {
  const preheader = escapeHtml(options.preheader ?? options.headline)
  const headline = escapeHtml(options.headline)
  const paragraphs = options.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(p)}</p>`,
    )
    .join('')

  const otpBlock =
    options.otpCode != null
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
          <tr>
            <td align="center" style="padding:18px 16px;background:#fff4ed;border:1px solid #fbd0b5;border-radius:10px;">
              <span style="font-family:ui-monospace,'Cascadia Code',Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.primary};">${escapeHtml(options.otpCode)}</span>
            </td>
          </tr>
        </table>
        ${
          options.otpExpiresMinutes != null
            ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${BRAND.muted};">This code expires in ${options.otpExpiresMinutes} minutes.</p>`
            : ''
        }
      `.trim()
      : ''

  const ctaBlock = options.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
        <tr>
          <td align="center" style="border-radius:999px;background:${BRAND.primary};">
            <a href="${escapeHtml(options.cta.href)}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;padding:14px 28px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
              ${escapeHtml(options.cta.label)}
            </a>
          </td>
        </tr>
      </table>
    `.trim()
    : ''

  const footerNote = escapeHtml(
    options.footerNote ??
      'You received this message because of activity on your Repairex account. If this was not you, you can ignore this email.',
  )

  const appOrigin = escapeHtml(getAppOrigin())

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.canvas};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:${BRAND.footerBg};">
              ${brandMarkHtml()}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <h1 style="margin:0 0 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.3;color:${BRAND.ink};">${headline}</h1>
              ${paragraphs}
              ${otpBlock}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${footerNote}</p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
          <a href="${appOrigin}" style="color:${BRAND.primary};text-decoration:none;">repairex.app</a>
          · Smart electronics repair marketplace
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * @description OTP verification / password reset email HTML.
 * @param {object} input - Purpose, code, and expiry.
 * @returns {string} HTML body.
 */
export function buildOtpEmailHtml(input: {
  purpose: 'signup' | 'reset'
  code: string
  expiresMinutes: number
}): string {
  const isSignup = input.purpose === 'signup'
  return buildBrandedEmailHtml({
    preheader: isSignup
      ? 'Verify your Repairex account with this 6-digit code.'
      : 'Reset your Repairex password with this 6-digit code.',
    headline: isSignup ? 'Verify your email' : 'Reset your password',
    paragraphs: isSignup
      ? [
          'Welcome to Repairex. Enter the verification code below to finish setting up your account and start managing repair requests with transparent quotes.',
        ]
      : [
          'We received a request to reset your Repairex password. Enter the code below to choose a new password.',
        ],
    otpCode: input.code,
    otpExpiresMinutes: input.expiresMinutes,
    footerNote:
      'If you did not request this code, you can safely ignore this email — your password will not change.',
  })
}

/**
 * @description Repair lifecycle notification email HTML.
 * @param {object} input - Subject line copy, body, and dashboard link.
 * @returns {string} HTML body.
 */
export function buildLifecycleEmailHtml(input: {
  headline: string
  bodyText: string
  dashboardUrl: string
}): string {
  return buildBrandedEmailHtml({
    preheader: input.bodyText,
    headline: input.headline,
    paragraphs: [input.bodyText],
    cta: {
      label: 'Open Repairex dashboard',
      href: input.dashboardUrl,
    },
  })
}
