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
  assignedVendorId?: string
  assignedVendorName?: string
  acceptedEstimateId?: string
  acceptedCostMin?: number
  acceptedCostMax?: number
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
    assignedVendorId: doc.assignedVendorId ? doc.assignedVendorId.toString() : undefined,
    assignedVendorName: doc.assignedVendorName ?? undefined,
    acceptedEstimateId: doc.acceptedEstimateId ? doc.acceptedEstimateId.toString() : undefined,
    acceptedCostMin: doc.acceptedCostMin ?? undefined,
    acceptedCostMax: doc.acceptedCostMax ?? undefined,
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

/**
 * @description Finds open marketplace repair requests available for vendor estimation.
 * Open requests are those with status 'submitted' or 'estimated'.
 * @async
 * @param {object} [filters] - Filter by device type and urgency.
 * @returns {Promise<RepairRecord[]>} Open repair requests sorted by latest first.
 */
export async function findOpenMarketplaceRequests(filters?: {
  deviceType?: DeviceType
  urgency?: Urgency
}): Promise<RepairRecord[]> {
  const allowedStatuses: RepairStatus[] = ['submitted', 'estimated']

  if (isMemoryStore()) {
    return Array.from(memoryRepairs.values())
      .filter((r) => {
        if (!allowedStatuses.includes(r.status)) return false
        if (filters?.deviceType && r.deviceType !== filters.deviceType) return false
        if (filters?.urgency && r.urgency !== filters.urgency) return false
        return true
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  const query: Record<string, unknown> = {
    status: { $in: allowedStatuses },
  }
  if (filters?.deviceType) query.deviceType = filters.deviceType
  if (filters?.urgency) query.urgency = filters.urgency

  const docs = await RepairRequestModel.find(query).sort({ createdAt: -1 })
  return docs.map(fromMongo)
}

/**
 * @description Assigns an accepted vendor estimate to a repair ticket and advances status to 'vendor_selected'.
 * @async
 */
export async function assignVendorToRepair(
  id: string,
  assignment: {
    vendorId: string
    vendorName: string
    estimateId: string
    acceptedCostMin?: number
    acceptedCostMax?: number
  },
): Promise<RepairRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const existing = memoryRepairs.get(id)
    if (!existing) return null
    const updated: RepairRecord = {
      ...existing,
      status: 'vendor_selected',
      assignedVendorId: assignment.vendorId,
      assignedVendorName: assignment.vendorName,
      acceptedEstimateId: assignment.estimateId,
      acceptedCostMin: assignment.acceptedCostMin,
      acceptedCostMax: assignment.acceptedCostMax,
      updatedAt: now,
    }
    memoryRepairs.set(id, updated)
    return updated
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const doc = await RepairRequestModel.findByIdAndUpdate(
    id,
    {
      status: 'vendor_selected',
      assignedVendorId: new mongoose.Types.ObjectId(assignment.vendorId),
      assignedVendorName: assignment.vendorName,
      acceptedEstimateId: new mongoose.Types.ObjectId(assignment.estimateId),
      acceptedCostMin: assignment.acceptedCostMin,
      acceptedCostMax: assignment.acceptedCostMax,
    },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}

