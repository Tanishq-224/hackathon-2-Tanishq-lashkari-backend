import { getAdminEmailList } from '../config/adminEmails.js'
import { findUserByEmail, updateUserRole } from '../repositories/auth.repository.js'

/**
 * @description Promotes configured ADMIN_EMAILS users to the admin role when they already exist.
 * @async
 */
export async function syncPlatformAdminRoles(): Promise<void> {
  for (const email of getAdminEmailList()) {
    const user = await findUserByEmail(email)
    if (user && user.role !== 'admin') {
      await updateUserRole(user.id, 'admin')
      console.info(`[admin] Promoted ${email} to platform admin.`)
    }
  }
}
