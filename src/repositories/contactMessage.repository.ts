import crypto from 'node:crypto'

import mongoose from 'mongoose'

import { isMemoryAuthStore } from './auth.repository.js'
import {
  ContactMessageModel,
  type ContactMessageDocument,
  type ContactMessageStatus,
} from '../models/ContactMessage.model.js'
import type { ContactMessageInput } from '../schemas/contactMessage.schema.js'

export type ContactMessageRecord = {
  id: string
  fullName: string
  email: string
  phone?: string
  topic: ContactMessageInput['topic']
  message: string
  status: ContactMessageStatus
  internalNote?: string
  createdAt: string
  updatedAt: string
}

type MemoryContactMessage = ContactMessageRecord

const memoryContactMessages: MemoryContactMessage[] = []

/**
 * @description Clears in-memory contact messages (tests only).
 */
export function clearMemoryContactStore(): void {
  memoryContactMessages.length = 0
}

function fromMongo(doc: ContactMessageDocument): ContactMessageRecord {
  return {
    id: doc._id.toString(),
    fullName: doc.fullName,
    email: doc.email,
    phone: doc.phone ?? undefined,
    topic: doc.topic as ContactMessageInput['topic'],
    message: doc.message,
    status: doc.status as ContactMessageStatus,
    internalNote: doc.internalNote ?? undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

/**
 * @description Persists a public contact form submission.
 */
export async function createContactMessage(
  input: ContactMessageInput,
): Promise<ContactMessageRecord> {
  const now = new Date().toISOString()

  if (isMemoryAuthStore()) {
    const record: MemoryContactMessage = {
      id: crypto.randomUUID(),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      topic: input.topic,
      message: input.message,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    }
    memoryContactMessages.unshift(record)
    return record
  }

  const doc = await ContactMessageModel.create({
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    topic: input.topic,
    message: input.message,
    status: 'new',
  })

  return fromMongo(doc)
}

export type ListContactMessagesOptions = {
  status?: ContactMessageStatus
  topic?: ContactMessageInput['topic']
  limit?: number
  page?: number
}

/**
 * @description Lists contact messages for the admin inbox (newest first).
 */
export async function listContactMessages(
  options: ListContactMessagesOptions = {},
): Promise<{ items: ContactMessageRecord[]; total: number; page: number; limit: number }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const page = Math.max(options.page ?? 1, 1)
  const skip = (page - 1) * limit

  if (isMemoryAuthStore()) {
    let filtered = [...memoryContactMessages]
    if (options.status) {
      filtered = filtered.filter((item) => item.status === options.status)
    }
    if (options.topic) {
      filtered = filtered.filter((item) => item.topic === options.topic)
    }
    const total = filtered.length
    const items = filtered.slice(skip, skip + limit)
    return { items, total, page, limit }
  }

  const query: Record<string, unknown> = {}
  if (options.status) {
    query.status = options.status
  }
  if (options.topic) {
    query.topic = options.topic
  }

  const [docs, total] = await Promise.all([
    ContactMessageModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ContactMessageModel.countDocuments(query),
  ])

  return {
    items: docs.map(fromMongo),
    total,
    page,
    limit,
  }
}

/**
 * @description Loads one contact message by id.
 */
export async function findContactMessageById(
  id: string,
): Promise<ContactMessageRecord | null> {
  if (isMemoryAuthStore()) {
    return memoryContactMessages.find((item) => item.id === id) ?? null
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const doc = await ContactMessageModel.findById(id)
  return doc ? fromMongo(doc) : null
}

/**
 * @description Updates admin workflow fields on a contact message.
 */
export async function updateContactMessageAdminFields(
  id: string,
  patch: { status?: ContactMessageStatus; internalNote?: string },
): Promise<ContactMessageRecord | null> {
  if (isMemoryAuthStore()) {
    const index = memoryContactMessages.findIndex((item) => item.id === id)
    if (index === -1) {
      return null
    }
    const current = memoryContactMessages[index]
    const updated: MemoryContactMessage = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    memoryContactMessages[index] = updated
    return updated
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const doc = await ContactMessageModel.findByIdAndUpdate(
    id,
    {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.internalNote !== undefined ? { internalNote: patch.internalNote } : {}),
    },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}
