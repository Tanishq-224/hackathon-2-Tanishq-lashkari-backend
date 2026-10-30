import {
  attachQuotationToRepair,
  findRepairRequestById,
  revertRepairAfterQuotationWithdraw,
  updateRepairQuotationDecision,
  type RepairRecord,
} from '../repositories/repair.repository.js'
import {
  findQuotationByRepairRequestId,
  markQuotationWithdrawn,
  recordQuotationDecision,
  saveQuotation,
  type QuotationRecord,
} from '../repositories/quotation.repository.js'
import type {
  CreateQuotationInput,
  QuotationDecisionInput,
} from '../schemas/quotation.schema.js'
import { queueRepairRefresh } from '../realtime/realtime.service.js'
import {
  formatDeviceLabel,
  notifyCustomerQuotationReady,
  notifyVendorQuoteApproved,
  notifyVendorQuoteDeclined,
} from './lifecycleNotify.service.js'
import { AppError } from '../utils/AppError.js'

type AuthenticatedUser = {
  id: string
  fullName: string
  email: string
  role: 'customer' | 'vendor' | 'admin'
}

/**
 * @description Submits physical diagnostic findings and itemized line items by the assigned vendor.
 * @async
 */
export async function submitDiagnosticQuotation(
  vendor: AuthenticatedUser,
  repairRequestId: string,
  data: CreateQuotationInput,
): Promise<{ quotation: QuotationRecord; repair: RepairRecord }> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.assignedVendorId !== vendor.id && vendor.role !== 'admin') {
    throw new AppError(
      'Only the assigned vendor can submit diagnostic findings and quotation for this ticket.',
      403,
    )
  }

  if (repair.status !== 'vendor_selected' && repair.status !== 'diagnosed') {
    throw new AppError(
      'Quotation cannot be submitted for tickets not currently in vendor diagnosis stage.',
      400,
    )
  }

  const existingQuotation = await findQuotationByRepairRequestId(repairRequestId)
  if (existingQuotation) {
    if (existingQuotation.status === 'approved' || existingQuotation.status === 'rejected') {
      throw new AppError('This quotation has already been finalized and cannot be changed.', 400)
    }
    if (
      existingQuotation.status === 'pending' &&
      repair.status === 'diagnosed' &&
      existingQuotation.vendorId === vendor.id
    ) {
      // Vendor revises a pending quote awaiting customer approval
    } else if (existingQuotation.status === 'withdrawn') {
      // Vendor resubmits after withdrawing
    } else if (existingQuotation.status === 'pending') {
      throw new AppError('A quotation is already awaiting customer approval.', 400)
    }
  }

  const totalAmount = data.lineItems.reduce((acc, item) => acc + item.cost, 0)

  const quotation = await saveQuotation({
    repairRequestId,
    vendorId: vendor.id,
    vendorName: vendor.fullName,
    diagnosticFindings: data.diagnosticFindings,
    lineItems: data.lineItems,
    totalAmount,
    estimatedCompletion: data.estimatedCompletion,
  })

  const updatedRepair = await attachQuotationToRepair(repairRequestId, quotation.id)
  if (!updatedRepair) {
    throw new AppError('Failed to update repair request with diagnostic quotation.', 500)
  }

  notifyCustomerQuotationReady({
    customerId: repair.customerId,
    repairRequestId,
    vendorName: vendor.fullName,
    totalAmount,
    deviceLabel: formatDeviceLabel(repair.brand, repair.modelName),
  })

  queueRepairRefresh(repairRequestId, 'quotation_submitted')

  return { quotation, repair: updatedRepair }
}

/**
 * @description Retrieves the itemized diagnostic quotation for a repair request with authorization checks.
 * @async
 */
export async function getQuotationForRepair(
  user: AuthenticatedUser,
  repairRequestId: string,
): Promise<QuotationRecord | null> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (user.role === 'customer' && repair.customerId !== user.id) {
    throw new AppError('You are not authorized to view quotations for this repair ticket.', 403)
  }

  if (
    user.role === 'vendor' &&
    repair.assignedVendorId &&
    repair.assignedVendorId !== user.id
  ) {
    throw new AppError('You are not authorized to view quotations for this repair ticket.', 403)
  }

  return findQuotationByRepairRequestId(repairRequestId)
}

/**
 * @description Records customer approval or rejection of an itemized diagnostic quotation.
 * @async
 */
export async function decideQuotation(
  customer: AuthenticatedUser,
  repairRequestId: string,
  data: QuotationDecisionInput,
): Promise<{
  quotation: QuotationRecord
  repair: RepairRecord
  message: string
}> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (customer.role === 'customer' && repair.customerId !== customer.id) {
    throw new AppError('You are not authorized to make decisions on this repair ticket.', 403)
  }

  const existingQuotation = await findQuotationByRepairRequestId(repairRequestId)
  if (!existingQuotation) {
    throw new AppError(
      'Diagnostic quotation has not been submitted for this repair ticket yet.',
      404,
    )
  }

  if (existingQuotation.status !== 'pending') {
    throw new AppError(
      `This quotation has already been ${existingQuotation.status}.`,
      400,
    )
  }

  const updatedQuotation = await recordQuotationDecision(
    repairRequestId,
    data.decision,
    data.feedback,
  )

  if (!updatedQuotation) {
    throw new AppError('Failed to record customer decision on quotation.', 500)
  }

  const nextStatus = data.decision === 'approved' ? 'quote_approved' : 'cancelled'
  const finalApprovedAmount =
    data.decision === 'approved' ? updatedQuotation.totalAmount : undefined

  const updatedRepair = await updateRepairQuotationDecision(
    repairRequestId,
    nextStatus,
    finalApprovedAmount,
  )

  if (!updatedRepair) {
    throw new AppError('Failed to update repair request lifecycle status.', 500)
  }

  const message =
    data.decision === 'approved'
      ? 'Quotation approved successfully. Repair work authorized!'
      : 'Quotation declined. Repair ticket cancelled.'

  const deviceLabel = formatDeviceLabel(repair.brand, repair.modelName)
  if (data.decision === 'approved' && repair.assignedVendorId) {
    notifyVendorQuoteApproved({
      vendorId: repair.assignedVendorId,
      repairRequestId,
      deviceLabel,
      amount: updatedQuotation.totalAmount,
    })
  } else if (data.decision === 'rejected' && repair.assignedVendorId) {
    notifyVendorQuoteDeclined({
      vendorId: repair.assignedVendorId,
      repairRequestId,
      deviceLabel,
    })
  }

  queueRepairRefresh(repairRequestId, `quotation_${data.decision}`)

  return {
    quotation: updatedQuotation,
    repair: updatedRepair,
    message,
  }
}

/**
 * @description Assigned vendor withdraws a pending diagnostic quotation before customer decision.
 * @async
 */
export async function withdrawDiagnosticQuotation(
  vendor: AuthenticatedUser,
  repairRequestId: string,
): Promise<{ quotation: QuotationRecord; repair: RepairRecord; message: string }> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (repair.assignedVendorId !== vendor.id && vendor.role !== 'admin') {
    throw new AppError('Only the assigned vendor can withdraw this quotation.', 403)
  }

  const quotation = await findQuotationByRepairRequestId(repairRequestId)
  if (!quotation) {
    throw new AppError('No quotation exists for this repair ticket.', 404)
  }

  if (quotation.status !== 'pending') {
    throw new AppError('Only pending quotations can be withdrawn.', 400)
  }

  const updatedQuotation = await markQuotationWithdrawn(repairRequestId)
  if (!updatedQuotation) {
    throw new AppError('Failed to withdraw quotation.', 500)
  }

  const updatedRepair = await revertRepairAfterQuotationWithdraw(repairRequestId)
  if (!updatedRepair) {
    throw new AppError('Failed to update repair ticket after withdrawal.', 500)
  }

  queueRepairRefresh(repairRequestId, 'quotation_withdrawn')

  return {
    quotation: updatedQuotation,
    repair: updatedRepair,
    message: 'Quotation withdrawn. You can submit a revised quote when ready.',
  }
}

