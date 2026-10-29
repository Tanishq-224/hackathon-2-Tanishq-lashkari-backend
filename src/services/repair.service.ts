import {
  createRepairRequest,
  findRepairRequestById,
  findRepairRequestsByAssignedVendor,
  findRepairRequestsByCustomer,
  type RepairRecord,
} from '../repositories/repair.repository.js'
import type { CreateRepairInput } from '../schemas/repair.schema.js'
import { AppError } from '../utils/AppError.js'

/**
 * @description Creates a new repair request for an authenticated customer.
 * @async
 * @param {string} customerId - Authenticated customer ID.
 * @param {CreateRepairInput} input - Validated input data.
 * @returns {Promise<RepairRecord>} Created repair record.
 */
export async function createCustomerRepairRequest(
  customerId: string,
  input: CreateRepairInput,
): Promise<RepairRecord> {
  return createRepairRequest({
    customerId,
    deviceType: input.deviceType,
    brand: input.brand,
    modelName: input.modelName,
    issueCategory: input.issueCategory,
    description: input.description,
    images: input.images,
    urgency: input.urgency,
    estimatedBudgetMin: input.estimatedBudgetMin,
    estimatedBudgetMax: input.estimatedBudgetMax,
  })
}

/**
 * @description Retrieves all repair requests for the authenticated customer.
 * @async
 * @param {string} customerId - Customer user ID.
 * @returns {Promise<RepairRecord[]>} Array of repair records.
 */
export async function getCustomerRepairRequests(
  customerId: string,
): Promise<RepairRecord[]> {
  return findRepairRequestsByCustomer(customerId)
}

/**
 * @description Lists repair tickets for the authenticated user based on role.
 * @async
 * @param {{ id: string; role: string }} user - Authenticated session user.
 * @returns {Promise<RepairRecord[]>} Customer-owned or vendor-assigned repairs.
 */
export async function getRepairRequestsForUser(user: {
  id: string
  role: string
}): Promise<RepairRecord[]> {
  if (user.role === 'vendor') {
    return findRepairRequestsByAssignedVendor(user.id)
  }

  if (user.role === 'customer') {
    return findRepairRequestsByCustomer(user.id)
  }

  // Admins see all assigned + customer tickets is out of scope; return empty for now
  return []
}

/**
 * @description Retrieves a single repair request by ID with ownership verification.
 * @async
 * @param {string} repairId - Repair request ID.
 * @param {object} requester - Current user making request.
 * @returns {Promise<RepairRecord>} Found repair record.
 */
export async function getRepairRequestDetails(
  repairId: string,
  requester: { id: string; role: string },
): Promise<RepairRecord> {
  const repair = await findRepairRequestById(repairId)

  if (!repair) {
    throw new AppError('Repair request not found.', 404)
  }

  if (requester.role === 'customer' && repair.customerId !== requester.id) {
    throw new AppError('You are not authorized to view this repair request.', 403)
  }

  if (
    requester.role === 'vendor' &&
    repair.assignedVendorId !== requester.id &&
    repair.status !== 'submitted' &&
    repair.status !== 'estimated'
  ) {
    throw new AppError('You are not authorized to view this repair request.', 403)
  }

  return repair
}

