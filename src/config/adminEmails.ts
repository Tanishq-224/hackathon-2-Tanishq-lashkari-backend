import { env } from './env.js'

/**
 * @description Parses configured platform admin emails (comma-separated, lowercase).
 * @returns {string[]} Admin email list.
 */
export function getAdminEmailList(): string[] {
  const configured = process.env.ADMIN_EMAILS ?? env.ADMIN_EMAILS
  return configured.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
}

/**
 * @description Whether the email is designated as a platform admin.
 * @param {string} email - Email to check.
 * @returns {boolean}
 */
export function isAdminEmail(email: string): boolean {
  return getAdminEmailList().includes(email.toLowerCase().trim())
}
