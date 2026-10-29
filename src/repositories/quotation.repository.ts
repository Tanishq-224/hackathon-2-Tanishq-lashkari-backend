import crypto from 'node:crypto'
import mongoose from 'mongoose'

import {
  QuotationModel,
  type LineItemCategory,
  type QuotationDocument,
  type QuotationStatus,
} from '../models/Quotation.model.js'

export type QuotationLineItem = {
  description: string
  category: LineItemCategory
  cost: number
}

export type QuotationRecord = {
  id: string
  repairRequestId: string
  vendorId: string
  vendorName: string
  diagnosticFindings: string
  lineItems: QuotationLineItem[]
  totalAmount: number
  estimatedCompletion: string
  status: QuotationStatus
  customerDecisionAt?: string
  customerFeedback?: string
  createdAt: string
  updatedAt: string
}

const memoryQuotations = new Map<string, QuotationRecord>()

function isMemoryStore(): boolean {
  return mongoose.connection.readyState !== 1
}

export function clearMemoryQuotationStore(): void {
  memoryQuotations.clear()
}

function fromMongo(doc: QuotationDocument): QuotationRecord {
  return {
    id: doc._id.toString(),
    repairRequestId: doc.repairRequestId.toString(),
    vendorId: doc.vendorId.toString(),
    vendorName: doc.vendorName,
    diagnosticFindings: doc.diagnosticFindings,
    lineItems: (doc.lineItems || []).map((item) => ({
      description: item.description,
      category: item.category as LineItemCategory,
      cost: item.cost,
    })),
    totalAmount: doc.totalAmount,
    estimatedCompletion: doc.estimatedCompletion,
    status: (doc.status as QuotationStatus) || 'pending',
    customerDecisionAt: (doc as unknown as { customerDecisionAt?: Date }).customerDecisionAt?.toISOString(),
    customerFeedback: doc.customerFeedback ?? undefined,
    createdAt: (doc as unknown as { createdAt: Date }).createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt?.toISOString() || new Date().toISOString(),
  }
}

/**
 * @description Creates or updates an itemized quotation for a repair request.
 * @async
 */
export async function saveQuotation(input: {
  repairRequestId: string
  vendorId: string
  vendorName: string
  diagnosticFindings: string
  lineItems: QuotationLineItem[]
  totalAmount: number
  estimatedCompletion: string
}): Promise<QuotationRecord> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    // Check if one already exists for this repair request
    let existingId: string | undefined
    for (const [id, q] of memoryQuotations.entries()) {
      if (q.repairRequestId === input.repairRequestId) {
        existingId = id
        break
      }
    }

    const id = existingId ?? crypto.randomUUID()
    const record: QuotationRecord = {
      id,
      repairRequestId: input.repairRequestId,
      vendorId: input.vendorId,
      vendorName: input.vendorName,
      diagnosticFindings: input.diagnosticFindings.trim(),
      lineItems: input.lineItems,
      totalAmount: input.totalAmount,
      estimatedCompletion: input.estimatedCompletion.trim(),
      status: 'pending',
      createdAt: existingId ? memoryQuotations.get(id)!.createdAt : now,
      updatedAt: now,
    }
    memoryQuotations.set(id, record)
    return record
  }

  const doc = await QuotationModel.findOneAndUpdate(
    { repairRequestId: new mongoose.Types.ObjectId(input.repairRequestId) },
    {
      repairRequestId: new mongoose.Types.ObjectId(input.repairRequestId),
      vendorId: new mongoose.Types.ObjectId(input.vendorId),
      vendorName: input.vendorName,
      diagnosticFindings: input.diagnosticFindings.trim(),
      lineItems: input.lineItems,
      totalAmount: input.totalAmount,
      estimatedCompletion: input.estimatedCompletion.trim(),
      status: 'pending',
    },
    { upsert: true, returnDocument: 'after' },
  )

  return fromMongo(doc!)
}

/**
 * @description Finds an itemized quotation by repair request ID.
 * @async
 */
export async function findQuotationByRepairRequestId(
  repairRequestId: string,
): Promise<QuotationRecord | null> {
  if (isMemoryStore()) {
    for (const q of memoryQuotations.values()) {
      if (q.repairRequestId === repairRequestId) {
        return q
      }
    }
    return null
  }

  if (!mongoose.Types.ObjectId.isValid(repairRequestId)) {
    return null
  }

  const doc = await QuotationModel.findOne({
    repairRequestId: new mongoose.Types.ObjectId(repairRequestId),
  })

  return doc ? fromMongo(doc) : null
}

/**
 * @description Updates quotation customer decision (approved/rejected).
 * @async
 */
export async function recordQuotationDecision(
  repairRequestId: string,
  decision: 'approved' | 'rejected',
  feedback?: string,
): Promise<QuotationRecord | null> {
  const now = new Date().toISOString()

  if (isMemoryStore()) {
    for (const [id, q] of memoryQuotations.entries()) {
      if (q.repairRequestId === repairRequestId) {
        const updated: QuotationRecord = {
          ...q,
          status: decision,
          customerDecisionAt: now,
          customerFeedback: feedback?.trim() || undefined,
          updatedAt: now,
        }
        memoryQuotations.set(id, updated)
        return updated
      }
    }
    return null
  }

  if (!mongoose.Types.ObjectId.isValid(repairRequestId)) {
    return null
  }

  const doc = await QuotationModel.findOneAndUpdate(
    { repairRequestId: new mongoose.Types.ObjectId(repairRequestId) },
    {
      status: decision,
      customerDecisionAt: new Date(),
      customerFeedback: feedback?.trim() || undefined,
    },
    { returnDocument: 'after' },
  )

  return doc ? fromMongo(doc) : null
}

