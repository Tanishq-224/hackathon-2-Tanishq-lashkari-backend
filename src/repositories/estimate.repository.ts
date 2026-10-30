import crypto from 'node:crypto'
import mongoose from 'mongoose'

import {
  EstimateModel,
  type EstimateDocument,
  type EstimateStatus,
} from '../models/Estimate.model.js'

export type EstimateComponentLine = {
  component: string
  price: number
  warrantyMonths: number
}

export type EstimateRecord = {
  id: string
  repairRequestId: string
  vendorId: string
  vendorName: string
  vendorEmail: string
  minCost: number
  maxCost: number
  turnaroundTime: string
  warrantyMonths: number
  notes: string
  componentLines?: EstimateComponentLine[]
  labourCost?: number
  status: EstimateStatus
  declineReason?: string
  createdAt: string
  updatedAt: string
}

const memoryEstimates = new Map<string, EstimateRecord>()

function isMemoryStore(): boolean {
  return mongoose.connection.readyState !== 1
}

export function clearMemoryEstimateStore(): void {
  memoryEstimates.clear()
}

function fromMongo(doc: EstimateDocument): EstimateRecord {
  const componentLines = Array.isArray(doc.componentLines)
    ? doc.componentLines.map((line) => ({
        component: line.component,
        price: line.price,
        warrantyMonths: line.warrantyMonths,
      }))
    : undefined

  return {
    id: doc._id.toString(),
    repairRequestId: doc.repairRequestId.toString(),
    vendorId: doc.vendorId.toString(),
    vendorName: doc.vendorName,
    vendorEmail: doc.vendorEmail,
    minCost: doc.minCost,
    maxCost: doc.maxCost,
    turnaroundTime: doc.turnaroundTime,
    warrantyMonths: doc.warrantyMonths,
    notes: doc.notes,
    componentLines,
    labourCost: typeof doc.labourCost === 'number' ? doc.labourCost : undefined,
    status: (doc.status as EstimateStatus) || 'pending',
    declineReason: doc.declineReason ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt?.toISOString() || new Date().toISOString(),
  }
}

/**
 * @description Creates a new vendor repair estimate.
 * @async
 */
export async function createEstimate(input: {
  repairRequestId: string
  vendorId: string
  vendorName: string
  vendorEmail: string
  minCost: number
  maxCost: number
  turnaroundTime: string
  warrantyMonths: number
  notes: string
  componentLines?: EstimateComponentLine[]
  labourCost?: number
}): Promise<EstimateRecord> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const record: EstimateRecord = {
      id: crypto.randomUUID(),
      repairRequestId: input.repairRequestId,
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      vendorEmail: input.vendorEmail,
      minCost: input.minCost,
      maxCost: input.maxCost,
      turnaroundTime: input.turnaroundTime,
      warrantyMonths: input.warrantyMonths,
      notes: input.notes,
      componentLines: input.componentLines,
      labourCost: input.labourCost,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    memoryEstimates.set(record.id, record)
    return record
  }

  const doc = await EstimateModel.create({
    repairRequestId: new mongoose.Types.ObjectId(input.repairRequestId),
    vendorId: new mongoose.Types.ObjectId(input.vendorId),
    vendorName: input.vendorName,
    vendorEmail: input.vendorEmail,
    minCost: input.minCost,
    maxCost: input.maxCost,
    turnaroundTime: input.turnaroundTime,
    warrantyMonths: input.warrantyMonths,
    notes: input.notes,
    componentLines: input.componentLines,
    labourCost: input.labourCost,
    status: 'pending',
  })

  return fromMongo(doc)
}

type EstimateWriteInput = {
  minCost: number
  maxCost: number
  turnaroundTime: string
  warrantyMonths: number
  notes: string
  componentLines?: EstimateComponentLine[]
  labourCost?: number
}

/**
 * @description Updates an existing estimate (typically while still pending).
 * @async
 */
export async function updateEstimate(
  estimateId: string,
  input: EstimateWriteInput,
): Promise<EstimateRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const record = memoryEstimates.get(estimateId)
    if (!record) return null
    const updated: EstimateRecord = {
      ...record,
      ...input,
      status: 'pending',
      declineReason: undefined,
      updatedAt: now,
    }
    memoryEstimates.set(estimateId, updated)
    return updated
  }

  if (!mongoose.Types.ObjectId.isValid(estimateId)) {
    return null
  }

  const doc = await EstimateModel.findByIdAndUpdate(
    estimateId,
    {
      minCost: input.minCost,
      maxCost: input.maxCost,
      turnaroundTime: input.turnaroundTime,
      warrantyMonths: input.warrantyMonths,
      notes: input.notes,
      componentLines: input.componentLines,
      labourCost: input.labourCost,
      status: 'pending',
      declineReason: undefined,
    },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}

/**
 * @description Marks a vendor estimate as withdrawn by the submitting vendor.
 * @async
 */
export async function markEstimateWithdrawn(estimateId: string): Promise<EstimateRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    const record = memoryEstimates.get(estimateId)
    if (!record) return null
    record.status = 'withdrawn'
    record.declineReason = undefined
    record.updatedAt = now
    memoryEstimates.set(estimateId, record)
    return record
  }

  if (!mongoose.Types.ObjectId.isValid(estimateId)) {
    return null
  }

  const doc = await EstimateModel.findByIdAndUpdate(
    estimateId,
    { status: 'withdrawn', declineReason: undefined },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}

/**
 * @description Marks a pending estimate as declined by the customer.
 * @async
 */
export async function markEstimateDeclinedByCustomer(
  estimateId: string,
  declineReason?: string,
): Promise<EstimateRecord | null> {
  const now = new Date().toISOString()
  const trimmedReason = declineReason?.trim() || undefined

  if (isMemoryStore()) {
    const record = memoryEstimates.get(estimateId)
    if (!record) return null
    record.status = 'declined'
    record.declineReason = trimmedReason
    record.updatedAt = now
    memoryEstimates.set(estimateId, record)
    return record
  }

  if (!mongoose.Types.ObjectId.isValid(estimateId)) {
    return null
  }

  const doc = await EstimateModel.findByIdAndUpdate(
    estimateId,
    { status: 'declined', declineReason: trimmedReason },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}

/**
 * @description Finds all estimates submitted for a specific repair request.
 * @async
 */
export async function findEstimatesByRepairRequestId(
  repairRequestId: string,
): Promise<EstimateRecord[]> {
  if (isMemoryStore()) {
    return Array.from(memoryEstimates.values())
      .filter((e) => e.repairRequestId === repairRequestId)
      .sort((a, b) => a.minCost - b.minCost)
  }

  if (!mongoose.Types.ObjectId.isValid(repairRequestId)) {
    return []
  }

  const docs = await EstimateModel.find({
    repairRequestId: new mongoose.Types.ObjectId(repairRequestId),
  }).sort({ minCost: 1 })

  return docs.map(fromMongo)
}

/**
 * @description Finds a single estimate by ID.
 * @async
 */
export async function findEstimateById(id: string): Promise<EstimateRecord | null> {
  if (isMemoryStore()) {
    return memoryEstimates.get(id) ?? null
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null
  }

  const doc = await EstimateModel.findById(id)
  return doc ? fromMongo(doc) : null
}

/**
 * @description Finds an estimate submitted by a specific vendor on a repair request.
 * @async
 */
export async function findEstimateByVendorAndRepair(
  vendorId: string,
  repairRequestId: string,
): Promise<EstimateRecord | null> {
  if (isMemoryStore()) {
    return (
      Array.from(memoryEstimates.values()).find(
        (e) => e.vendorId === vendorId && e.repairRequestId === repairRequestId,
      ) ?? null
    )
  }

  if (
    !mongoose.Types.ObjectId.isValid(vendorId) ||
    !mongoose.Types.ObjectId.isValid(repairRequestId)
  ) {
    return null
  }

  const doc = await EstimateModel.findOne({
    vendorId: new mongoose.Types.ObjectId(vendorId),
    repairRequestId: new mongoose.Types.ObjectId(repairRequestId),
  })

  return doc ? fromMongo(doc) : null
}

/**
 * @description Accepts an estimate and marks other estimates for this ticket as declined.
 * @async
 */
export async function markEstimateAccepted(
  acceptedEstimateId: string,
  repairRequestId: string,
): Promise<EstimateRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    let acceptedRecord: EstimateRecord | null = null
    for (const [id, record] of memoryEstimates.entries()) {
      if (record.repairRequestId === repairRequestId) {
        if (id === acceptedEstimateId) {
          record.status = 'accepted'
          record.updatedAt = now
          acceptedRecord = record
        } else if (record.status === 'pending') {
          record.status = 'declined'
          record.updatedAt = now
        }
        memoryEstimates.set(id, record)
      }
    }
    return acceptedRecord
  }

  if (
    !mongoose.Types.ObjectId.isValid(acceptedEstimateId) ||
    !mongoose.Types.ObjectId.isValid(repairRequestId)
  ) {
    return null
  }

  // Set selected estimate to accepted
  const acceptedDoc = await EstimateModel.findByIdAndUpdate(
    acceptedEstimateId,
    { status: 'accepted' },
    { returnDocument: 'after' },
  )

  // Set all other estimates for this ticket to declined
  await EstimateModel.updateMany(
    {
      repairRequestId: new mongoose.Types.ObjectId(repairRequestId),
      _id: { $ne: new mongoose.Types.ObjectId(acceptedEstimateId) },
      status: 'pending',
    },
    { status: 'declined' },
  )

  return acceptedDoc ? fromMongo(acceptedDoc) : null
}

