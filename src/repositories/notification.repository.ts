import crypto from 'node:crypto'
import mongoose from 'mongoose'

import {
  NotificationModel,
  type NotificationDocument,
  type NotificationType,
} from '../models/Notification.model.js'

export type NotificationRecord = {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  repairRequestId?: string
  read: boolean
  createdAt: string
  updatedAt: string
}

const memoryNotifications = new Map<string, NotificationRecord>()

function isMemoryStore(): boolean {
  return mongoose.connection.readyState !== 1
}

/**
 * @description Clears in-memory notifications (tests).
 */
export function clearMemoryNotificationStore(): void {
  memoryNotifications.clear()
}

function fromMongo(doc: NotificationDocument): NotificationRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    type: doc.type as NotificationType,
    title: doc.title,
    message: doc.message,
    repairRequestId: doc.repairRequestId
      ? doc.repairRequestId.toString()
      : undefined,
    read: doc.read,
    createdAt:
      (doc as unknown as { createdAt: Date }).createdAt?.toISOString() ||
      new Date().toISOString(),
    updatedAt:
      (doc as unknown as { updatedAt: Date }).updatedAt?.toISOString() ||
      new Date().toISOString(),
  }
}

/**
 * @description Persists an in-app notification for a user.
 * @async
 */
export async function createNotification(input: {
  userId: string
  type: NotificationType
  title: string
  message: string
  repairRequestId?: string
}): Promise<NotificationRecord> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const record: NotificationRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      repairRequestId: input.repairRequestId,
      read: false,
      createdAt: now,
      updatedAt: now,
    }
    memoryNotifications.set(record.id, record)
    return record
  }

  const doc = await NotificationModel.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    type: input.type,
    title: input.title,
    message: input.message,
    repairRequestId: input.repairRequestId
      ? new mongoose.Types.ObjectId(input.repairRequestId)
      : undefined,
    read: false,
  })

  return fromMongo(doc as NotificationDocument)
}

/**
 * @description Lists notifications for a user, newest first.
 * @async
 */
export async function findNotificationsByUserId(
  userId: string,
  limit = 30,
): Promise<NotificationRecord[]> {
  if (isMemoryStore()) {
    return Array.from(memoryNotifications.values())
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  const docs = await NotificationModel.find({
    userId: new mongoose.Types.ObjectId(userId),
  })
    .sort({ createdAt: -1 })
    .limit(limit)

  return docs.map((d) => fromMongo(d as NotificationDocument))
}

/**
 * @description Counts unread notifications for badge display.
 * @async
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  if (isMemoryStore()) {
    return Array.from(memoryNotifications.values()).filter(
      (n) => n.userId === userId && !n.read,
    ).length
  }

  return NotificationModel.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    read: false,
  })
}

/**
 * @description Marks one notification as read if it belongs to the user.
 * @async
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<NotificationRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const existing = memoryNotifications.get(notificationId)
    if (!existing || existing.userId !== userId) return null
    const updated = { ...existing, read: true, updatedAt: now }
    memoryNotifications.set(notificationId, updated)
    return updated
  }

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return null
  }

  const doc = await NotificationModel.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(notificationId),
      userId: new mongoose.Types.ObjectId(userId),
    },
    { read: true },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc as NotificationDocument) : null
}

/**
 * @description Marks all notifications read for a user.
 * @async
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  if (isMemoryStore()) {
    let count = 0
    for (const [id, n] of memoryNotifications.entries()) {
      if (n.userId === userId && !n.read) {
        memoryNotifications.set(id, { ...n, read: true, updatedAt: new Date().toISOString() })
        count += 1
      }
    }
    return count
  }

  const result = await NotificationModel.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), read: false },
    { read: true },
  )

  return result.modifiedCount
}
