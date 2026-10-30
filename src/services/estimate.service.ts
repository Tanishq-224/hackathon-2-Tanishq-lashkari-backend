import type { DeviceType, Urgency } from '../models/RepairRequest.model.js'
import {
  createEstimate,
  findEstimateById,
  findEstimateByVendorAndRepair,
  findEstimatesByRepairRequestId,
  markEstimateAccepted,
  markEstimateDeclinedByCustomer,
  markEstimateWithdrawn,
  updateEstimate,
  type EstimateRecord,
} from '../repositories/estimate.repository.js'
import {
  assignVendorToRepair,
  findOpenMarketplaceRequests,
  findRepairRequestById,
  updateRepairRequestStatus,
  type RepairRecord,
} from '../repositories/repair.repository.js'
import type { CreateEstimateInput } from '../schemas/estimate.schema.js'
import { queueRepairRefresh } from '../realtime/realtime.service.js'
import {
  formatDeviceLabel,
  notifyCustomerEstimateReceived,
  notifyVendorAssigned,
} from './lifecycleNotify.service.js'
import { AppError } from '../utils/AppError.js'

type AuthenticatedUser = {
  id: string
  fullName: string
  email: string
  role: 'customer' | 'vendor' | 'admin'
}

/**
 * @description Fetches all open repair requests available in the vendor marketplace feed.
 * @async
 */
export async function getMarketplaceFeed(filters?: {
  deviceType?: DeviceType
  urgency?: Urgency
}): Promise<RepairRecord[]> {
  return findOpenMarketplaceRequests(filters)
}

/**
 * @description Submits a preliminary repair estimate from an authorized vendor.
 * @async
 */
export async function submitVendorEstimate(
  vendor: AuthenticatedUser,
  repairRequestId: string,
  data: CreateEstimateInput,
): Promise<EstimateRecord> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.status !== 'submitted' && repair.status !== 'estimated') {
    throw new AppError('This repair request is no longer accepting estimates.', 400)
  }

  const existing = await findEstimateByVendorAndRepair(vendor.id, repairRequestId)
  if (existing && existing.status !== 'withdrawn') {
    throw new AppError(
      'You have already submitted an estimate for this repair request. Edit or withdraw it from your dashboard.',
      409,
    )
  }

  const writePayload = buildEstimateWritePayload(data)

  const estimate = existing
    ? await updateEstimate(existing.id, writePayload)
    : await createEstimate({
        repairRequestId,
        vendorId: vendor.id,
        vendorName: vendor.fullName,
        vendorEmail: vendor.email,
        ...writePayload,
      })

  if (!estimate) {
    throw new AppError('Failed to save estimate. Please try again.', 500)
  }

  // Advance ticket status to 'estimated' on first estimate
  if (repair.status === 'submitted') {
    await updateRepairRequestStatus(repairRequestId, 'estimated')
  }

  notifyCustomerEstimateReceived({
    customerId: repair.customerId,
    repairRequestId,
    vendorName: vendor.fullName,
    deviceLabel: formatDeviceLabel(repair.brand, repair.modelName),
  })

  queueRepairRefresh(repairRequestId, 'estimate_submitted')

  return estimate
}

/**
 * @description Retrieves estimates for a repair ticket with role-based authorization.
 * @async
 */
export async function getRepairEstimates(
  user: AuthenticatedUser,
  repairRequestId: string,
): Promise<EstimateRecord[]> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (user.role === 'customer') {
    if (repair.customerId !== user.id) {
      throw new AppError('You do not have access to view estimates for this request.', 403)
    }
    return findEstimatesByRepairRequestId(repairRequestId)
  }

  if (user.role === 'vendor') {
    // If this vendor is the selected/assigned technician or an admin, they see all
    if (repair.assignedVendorId === user.id) {
      return findEstimatesByRepairRequestId(repairRequestId)
    }
    // Otherwise, vendor only sees their own bid
    const ownEstimate = await findEstimateByVendorAndRepair(user.id, repairRequestId)
    return ownEstimate ? [ownEstimate] : []
  }

  // Admin sees all
  return findEstimatesByRepairRequestId(repairRequestId)
}

/**
 * @description Customer selects and accepts a vendor's estimate, assigning the vendor to the ticket.
 * @async
 */
export async function selectVendorEstimate(
  customer: AuthenticatedUser,
  repairRequestId: string,
  estimateId: string,
): Promise<{ repair: RepairRecord; acceptedEstimate: EstimateRecord }> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.customerId !== customer.id) {
    throw new AppError('Only the customer who created this request can select an estimate.', 403)
  }

  if (repair.status !== 'submitted' && repair.status !== 'estimated') {
    throw new AppError('A vendor has already been assigned or this request is closed.', 400)
  }

  const estimate = await findEstimateById(estimateId)
  if (!estimate || estimate.repairRequestId !== repairRequestId) {
    throw new AppError('The selected estimate was not found for this repair ticket.', 404)
  }

  if (estimate.status !== 'pending') {
    throw new AppError('This estimate is no longer available for acceptance.', 400)
  }

  const accepted = await markEstimateAccepted(estimateId, repairRequestId)
  if (!accepted) {
    throw new AppError('Failed to accept estimate. Please try again.', 500)
  }

  const updatedRepair = await assignVendorToRepair(repairRequestId, {
    vendorId: estimate.vendorId,
    vendorName: estimate.vendorName,
    estimateId: estimate.id,
    acceptedCostMin: estimate.minCost,
    acceptedCostMax: estimate.maxCost,
  })

  if (!updatedRepair) {
    throw new AppError('Failed to update repair ticket with vendor assignment.', 500)
  }

  notifyVendorAssigned({
    vendorId: estimate.vendorId,
    repairRequestId,
    deviceLabel: formatDeviceLabel(repair.brand, repair.modelName),
  })

  queueRepairRefresh(repairRequestId, 'estimate_selected')

  return {
    repair: updatedRepair,
    acceptedEstimate: accepted,
  }
}

function buildEstimateWritePayload(data: CreateEstimateInput) {
  return {
    minCost: data.minCost,
    maxCost: data.maxCost,
    turnaroundTime: data.turnaroundTime,
    warrantyMonths: data.warrantyMonths,
    notes: data.notes,
    componentLines: 'componentLines' in data ? data.componentLines : undefined,
    labourCost: 'labourCost' in data ? data.labourCost : undefined,
  }
}

/**
 * @description Customer rejects a pending vendor estimate without assigning a technician.
 * @async
 */
export async function rejectVendorEstimate(
  customer: AuthenticatedUser,
  repairRequestId: string,
  estimateId: string,
  reason?: string,
): Promise<EstimateRecord> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.customerId !== customer.id) {
    throw new AppError('Only the ticket owner can reject an estimate.', 403)
  }

  if (repair.status !== 'submitted' && repair.status !== 'estimated') {
    throw new AppError('Estimates can no longer be rejected on this ticket.', 400)
  }

  const estimate = await findEstimateById(estimateId)
  if (!estimate || estimate.repairRequestId !== repairRequestId) {
    throw new AppError('Estimate not found for this repair ticket.', 404)
  }

  if (estimate.status !== 'pending') {
    throw new AppError('Only pending estimates can be rejected.', 400)
  }

  const updated = await markEstimateDeclinedByCustomer(estimateId, reason)
  if (!updated) {
    throw new AppError('Failed to reject estimate.', 500)
  }

  queueRepairRefresh(repairRequestId, 'estimate_rejected')

  return updated
}

/**
 * @description Vendor withdraws their pending preliminary estimate.
 * @async
 */
export async function withdrawVendorEstimate(
  vendor: AuthenticatedUser,
  repairRequestId: string,
  estimateId: string,
): Promise<EstimateRecord> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.status !== 'submitted' && repair.status !== 'estimated') {
    throw new AppError('This repair request is no longer accepting estimate changes.', 400)
  }

  const estimate = await findEstimateById(estimateId)
  if (!estimate || estimate.repairRequestId !== repairRequestId) {
    throw new AppError('Estimate not found for this repair ticket.', 404)
  }

  if (estimate.vendorId !== vendor.id && vendor.role !== 'admin') {
    throw new AppError('You can only withdraw estimates that you submitted.', 403)
  }

  if (estimate.status !== 'pending') {
    throw new AppError('Only pending estimates can be withdrawn.', 400)
  }

  const updated = await markEstimateWithdrawn(estimateId)
  if (!updated) {
    throw new AppError('Failed to withdraw estimate.', 500)
  }

  queueRepairRefresh(repairRequestId, 'estimate_withdrawn')

  return updated
}

/**
 * @description Vendor updates a pending preliminary estimate.
 * @async
 */
export async function updateVendorEstimate(
  vendor: AuthenticatedUser,
  repairRequestId: string,
  estimateId: string,
  data: CreateEstimateInput,
): Promise<EstimateRecord> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.status !== 'submitted' && repair.status !== 'estimated') {
    throw new AppError('This repair request is no longer accepting estimate changes.', 400)
  }

  const estimate = await findEstimateById(estimateId)
  if (!estimate || estimate.repairRequestId !== repairRequestId) {
    throw new AppError('Estimate not found for this repair ticket.', 404)
  }

  if (estimate.vendorId !== vendor.id && vendor.role !== 'admin') {
    throw new AppError('You can only edit estimates that you submitted.', 403)
  }

  if (estimate.status !== 'pending') {
    throw new AppError('Only pending estimates can be edited.', 400)
  }

  const updated = await updateEstimate(estimateId, buildEstimateWritePayload(data))
  if (!updated) {
    throw new AppError('Failed to update estimate.', 500)
  }

  notifyCustomerEstimateReceived({
    customerId: repair.customerId,
    repairRequestId,
    vendorName: vendor.fullName,
    deviceLabel: formatDeviceLabel(repair.brand, repair.modelName),
  })

  queueRepairRefresh(repairRequestId, 'estimate_updated')

  return updated
}

