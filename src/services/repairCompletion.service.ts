import {
  findRepairRequestById,
  markRepairCompletedByCustomer,
  markRepairReadyForPickup,
  startRepairWorkOnTicket,
  type RepairRecord,
} from '../repositories/repair.repository.js'
import type {
  StartRepairWorkInput,
  SubmitRepairCompletionInput,
} from '../schemas/repairCompletion.schema.js'
import { queueRepairRefresh } from '../realtime/realtime.service.js'
import {
  formatDeviceLabel,
  notifyCustomerReadyForPickup,
} from './lifecycleNotify.service.js'
import { AppError } from '../utils/AppError.js'

type AuthenticatedUser = {
  id: string
  fullName: string
  email: string
  role: 'customer' | 'vendor' | 'admin'
}

/**
 * @description Ensures the caller is the vendor assigned to the repair ticket.
 * @param {RepairRecord} repair - Loaded repair record.
 * @param {AuthenticatedUser} user - Session user.
 */
function assertAssignedVendor(repair: RepairRecord, user: AuthenticatedUser): void {
  if (user.role === 'admin') return
  if (user.role !== 'vendor' || repair.assignedVendorId !== user.id) {
    throw new AppError('Only the assigned vendor can update repair execution for this ticket.', 403)
  }
}

/**
 * @description Vendor marks authorized repair work as started (quote_approved → in_repair).
 * @async
 */
export async function startRepairWork(
  vendor: AuthenticatedUser,
  repairRequestId: string,
  data: StartRepairWorkInput,
): Promise<{ repair: RepairRecord; message: string }> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  assertAssignedVendor(repair, vendor)

  if (repair.status !== 'quote_approved') {
    throw new AppError(
      'Repair work can only be started after the customer approves the final quotation.',
      400,
    )
  }

  const updated = await startRepairWorkOnTicket(repairRequestId, data.repairBenchNotes)
  if (!updated) {
    throw new AppError('Failed to start repair work on this ticket.', 500)
  }

  queueRepairRefresh(repairRequestId, 'in_repair')

  return {
    repair: updated,
    message: 'Repair work started. Device is now in active bench repair.',
  }
}

/**
 * @description Vendor submits after-repair proof and moves ticket to ready_for_pickup.
 * @async
 */
export async function submitRepairCompletionProof(
  vendor: AuthenticatedUser,
  repairRequestId: string,
  data: SubmitRepairCompletionInput,
): Promise<{ repair: RepairRecord; message: string }> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  assertAssignedVendor(repair, vendor)

  if (repair.status !== 'in_repair') {
    throw new AppError('Completion proof can only be submitted while the ticket is in repair.', 400)
  }

  const updated = await markRepairReadyForPickup(repairRequestId, {
    afterRepairImages: data.afterRepairImages,
    resolutionSummary: data.resolutionSummary,
  })
  if (!updated) {
    throw new AppError('Failed to save repair completion proof.', 500)
  }

  notifyCustomerReadyForPickup({
    customerId: repair.customerId,
    repairRequestId,
    deviceLabel: formatDeviceLabel(repair.brand, repair.modelName),
  })

  queueRepairRefresh(repairRequestId, 'ready_for_pickup')

  return {
    repair: updated,
    message: 'Repair completed on bench. Customer notified — device is ready for pickup.',
  }
}

/**
 * @description Customer confirms device pickup and closes the lifecycle (ready_for_pickup → completed).
 * @async
 */
export async function confirmRepairPickup(
  customer: AuthenticatedUser,
  repairRequestId: string,
): Promise<{ repair: RepairRecord; message: string }> {
  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (customer.role !== 'admin' && repair.customerId !== customer.id) {
    throw new AppError('Only the ticket owner can confirm pickup.', 403)
  }

  if (repair.status !== 'ready_for_pickup') {
    throw new AppError('This repair is not marked ready for pickup yet.', 400)
  }

  const updated = await markRepairCompletedByCustomer(repairRequestId)
  if (!updated) {
    throw new AppError('Failed to mark repair as completed.', 500)
  }

  queueRepairRefresh(repairRequestId, 'completed')

  return {
    repair: updated,
    message: 'Pickup confirmed. Repair ticket closed successfully.',
  }
}
