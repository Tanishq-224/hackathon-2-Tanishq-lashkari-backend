import {
  countUnreadNotifications,
  findNotificationsByUserId,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from '../repositories/notification.repository.js'
import { AppError } from '../utils/AppError.js'

/**
 * @description Returns notifications and unread count for the signed-in user.
 * @async
 */
export async function getUserNotifications(userId: string): Promise<{
  notifications: NotificationRecord[]
  unreadCount: number
}> {
  const [notifications, unreadCount] = await Promise.all([
    findNotificationsByUserId(userId),
    countUnreadNotifications(userId),
  ])
  return { notifications, unreadCount }
}

/**
 * @description Marks a single notification as read.
 * @async
 */
export async function readNotification(
  userId: string,
  notificationId: string,
): Promise<NotificationRecord> {
  const updated = await markNotificationRead(notificationId, userId)
  if (!updated) {
    throw new AppError('Notification not found.', 404)
  }
  return updated
}

/**
 * @description Marks all notifications read for the user.
 * @async
 */
export async function readAllNotifications(userId: string): Promise<{ updated: number }> {
  const updated = await markAllNotificationsRead(userId)
  return { updated }
}
