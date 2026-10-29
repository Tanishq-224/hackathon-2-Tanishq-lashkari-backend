import crypto from 'node:crypto'
import mongoose from 'mongoose'

import {
  RepairRequestModel,
  type DeviceType,
  type IssueCategory,
  type RepairRequestDocument,
  type RepairStatus,
  type Urgency,
} from '../models/RepairRequest.model.js'

export type ImageAttachment = {
  url: string
  publicId?: string
}

export type RepairRecord = {
  id: string
  customerId: string
  deviceType: DeviceType
  brand: string
  modelName: string
  issueCategory: IssueCategory
  description: string
  images: ImageAttachment[]
  urgency: Urgency
  status: RepairStatus
  estimatedBudgetMin?: number
  estimatedBudgetMax?: number
  createdAt: string
  updatedAt: string
}

const memoryRepairs = new Map<string, RepairRecord>()

/**
 * @description Whether repairs should use in-memory store (e.g. disconnected or tests).
 * @returns {boolean} True if using memory.
 */
function isMemoryStore(): boolean {
  return mongoose.connection.readyState !== 1
}

/**
 * @description Clears in-memory repairs (test helper).
 * @returns {void}
 */
export function clearMemoryRepairStore(): void {
  memoryRepairs.clear()
}

/**
 * @description Maps a Mongoose document to a plain RepairRecord.
 * @param {RepairRequestDocument} doc - Mongoose document.
 * @returns {RepairRecord} Plain record.
 */
function fromMongo(doc: RepairRequestDocument): RepairRecord {
  return {
    id: doc._id.toString(),
    customerId: doc.customerId.toString(),
    deviceType: doc.deviceType as DeviceType,
    brand: doc.brand,
    modelName: doc.modelName,
    issueCategory: doc.issueCategory as IssueCategory,
    description: doc.description,
    images: (doc.images || []).map((img) => ({
      url: img.url,
      publicId: img.publicId ?? undefined,
    })),
    urgency: (doc.urgency as Urgency) || 'medium',
    status: (doc.status as RepairStatus) || 'submitted',
    estimatedBudgetMin: doc.estimatedBudgetMin ?? undefined,
    estimatedBudgetMax: doc.estimatedBudgetMax ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt?.toISOString() || new Date().toISOString(),
  }
}

/**
 * @description Creates a new repair request.
 * @async
 * @param {object} input - Request payload.
 * @returns {Promise<RepairRecord>} Created repair request.
 */
export async function createRepairRequest(input: {
  customerId: string
  deviceType: DeviceType
  brand: string
  modelName: string
  issueCategory: IssueCategory
  description: string
  images?: ImageAttachment[]
  urgency?: Urgency
  estimatedBudgetMin?: number
  estimatedBudgetMax?: number
}): Promise<RepairRecord> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const record: RepairRecord = {
      id: crypto.randomUUID(),
      customerId: input.customerId,
      deviceType: input.deviceType,
      brand: input.brand.trim(),
      modelName: input.modelName.trim(),
      issueCategory: input.issueCategory,
      description: input.description.trim(),
      images: input.images || [],
      urgency: input.urgency || 'medium',
      status: 'submitted',
      estimatedBudgetMin: input.estimatedBudgetMin,
      estimatedBudgetMax: input.estimatedBudgetMax,
      createdAt: now,
      updatedAt: now,
    }
    memoryRepairs.set(record.id, record)
    return record
  }

  const doc = await RepairRequestModel.create({
    customerId: new mongoose.Types.ObjectId(input.customerId),
    deviceType: input.deviceType,
    brand: input.brand.trim(),
    modelName: input.modelName.trim(),
    issueCategory: input.issueCategory,
    description: input.description.trim(),
    images: input.images || [],
    urgency: input.urgency || 'medium',
    status: 'submitted',
    estimatedBudgetMin: input.estimatedBudgetMin,
    estimatedBudgetMax: input.estimatedBudgetMax,
  })

  return fromMongo(doc)
}

/**
 * @description Finds all repair requests submitted by a specific customer.
 * @async
 * @param {string} customerId - User ID of customer.
 * @returns {Promise<RepairRecord[]>} Customer's repair requests ordered by latest first.
 */
export async function findRepairRequestsByCustomer(
  customerId: string,
): Promise<RepairRecord[]> {
  if (isMemoryStore()) {
    return Array.from(memoryRepairs.values())
      .filter((r) => r.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  const docs = await RepairRequestModel.find({
    customerId: new mongoose.Types.ObjectId(customerId),
  }).sort({ createdAt: -1 })

  return docs.map(fromMongo)
}

/**
 * @description Finds a single repair request by ID.
 * @async
 * @param {string} id - Repair request ID.
 * @returns {Promise<RepairRecord | null>} Found record or null.
 */
export async function findRepairRequestById(
  id: string,
): Promise<RepairRecord | null> {
  if (isMemoryStore()) {
    return memoryRepairs.get(id) ?? null
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const doc = await RepairRequestModel.findById(id)
  return doc ? fromMongo(doc) : null
}

/**
 * @description Updates the status of a repair request.
 * @async
 * @param {string} id - Repair request ID.
 * @param {RepairStatus} status - New status.
 * @returns {Promise<RepairRecord | null>} Updated record.
 */
export async function updateRepairRequestStatus(
  id: string,
  status: RepairStatus,
): Promise<RepairRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const existing = memoryRepairs.get(id)
    if (!existing) return null
    const updated = { ...existing, status, updatedAt: now }
    memoryRepairs.set(id, updated)
    return updated
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const doc = await RepairRequestModel.findByIdAndUpdate(
    id,
    { status },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}

