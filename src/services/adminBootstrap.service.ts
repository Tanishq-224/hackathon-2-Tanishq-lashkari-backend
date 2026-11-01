import { env } from '../config/env.js'
import { getAdminEmailList } from '../config/adminEmails.js'
import {
  findUserByEmail,
  upsertEnvPlatformAdmin,
} from '../repositories/auth.repository.js'
import { hashPassword } from '../utils/password.js'

/**
 * @description Provisions platform admin account(s) from ADMIN_EMAILS + ADMIN_PASSWORD.
 * @async
 */
export async function bootstrapPlatformAdminFromEnv(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD ?? env.ADMIN_PASSWORD
  if (!password || password.length < 8) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        '[admin] ADMIN_PASSWORD is required in production to provision the platform admin account.',
      )
    }
    console.warn(
      '[admin] ADMIN_PASSWORD not set — skipping env admin bootstrap (local/test only).',
    )
    return
  }

  const passwordHash = await hashPassword(password)

  for (const email of getAdminEmailList()) {
    await upsertEnvPlatformAdmin({
      email,
      passwordHash,
      fullName: 'Repairex Platform Admin',
    })
    const exists = await findUserByEmail(email)
    if (exists) {
      console.info(`[admin] Env admin ready for login: ${email}`)
    }
  }
}
