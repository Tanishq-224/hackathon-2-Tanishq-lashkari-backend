import crypto from 'node:crypto'
import mongoose from 'mongoose'

import {
  EstimateModel,
  type EstimateDocument,
  type EstimateStatus,
} from '../models/Estimate.model.js'

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
  status: EstimateStatus
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
    status: (doc.status as EstimateStatus) || 'pending',
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
    status: 'pending',
  })

  return fromMongo(doc)
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
        } else {
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
    },
    { status: 'declined' },
  )

  return acceptedDoc ? fromMongo(acceptedDoc) : null
}

