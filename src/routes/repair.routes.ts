import { Router } from 'express'

import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js'
import {
  createRepairSchema,
  uploadImageSchema,
} from '../schemas/repair.schema.js'
import {
  createEstimateSchema,
  rejectEstimateSchema,
  selectEstimateSchema,
  updateEstimateSchema,
} from '../schemas/estimate.schema.js'
import {
  createQuotationSchema,
  quotationDecisionSchema,
} from '../schemas/quotation.schema.js'
import { uploadRepairImage } from '../services/cloudinary.service.js'
import {
  createCustomerRepairRequest,
  getRepairRequestDetails,
  getRepairRequestsForUser,
} from '../services/repair.service.js'
import {
  getRepairEstimates,
  rejectVendorEstimate,
  selectVendorEstimate,
  submitVendorEstimate,
  updateVendorEstimate,
  withdrawVendorEstimate,
} from '../services/estimate.service.js'
import {
  confirmRepairPickup,
  startRepairWork,
  submitRepairCompletionProof,
} from '../services/repairCompletion.service.js'
import {
  decideQuotation,
  getQuotationForRepair,
  submitDiagnosticQuotation,
  withdrawDiagnosticQuotation,
} from '../services/quotation.service.js'
import {
  startRepairWorkSchema,
  submitRepairCompletionSchema,
} from '../schemas/repairCompletion.schema.js'
import { AppError } from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const repairRouter = Router()

// All repair routes require an authenticated user
repairRouter.use(requireAuth)

/**
 * @description Upload an image to Cloudinary (returns secure_url and public_id).
 */
repairRouter.post(
  '/upload-image',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = uploadImageSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid image data.', 400)
    }

    const upload = await uploadRepairImage(parsed.data.imageData)
    res.status(200).json({
      success: true,
      data: upload,
    })
  }),
)

/**
 * @description Create a new repair request (Customer only).
 */
repairRouter.post(
  '/',
  requireRole('customer'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createRepairSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid repair request data.', 400)
    }

    const repair = await createCustomerRepairRequest(req.user!.id, parsed.data)
    res.status(201).json({
      success: true,
      data: { repair },
      message: 'Repair request created successfully.',
    })
  }),
)

/**
 * @description List repair tickets for the current user (customer-owned or vendor-assigned).
 */
repairRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.user!
    if (user.role !== 'customer' && user.role !== 'vendor') {
      throw new AppError('Forbidden. Access restricted to customers and vendors.', 403)
    }

    const repairs = await getRepairRequestsForUser(user)
    res.status(200).json({
      success: true,
      data: { repairs },
    })
  }),
)

/**
 * @description Get a specific repair request by ID.
 */
repairRouter.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const repair = await getRepairRequestDetails(id, req.user!)
    res.status(200).json({
      success: true,
      data: { repair },
    })
  }),
)

/**
 * @description Submit a vendor estimate for a repair request.
 */
repairRouter.post(
  '/:id/estimates',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const parsed = createEstimateSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid estimate data.', 400)
    }

    const estimate = await submitVendorEstimate(req.user!, id, parsed.data)
    res.status(201).json({
      success: true,
      data: { estimate },
      message: 'Estimate submitted successfully.',
    })
  }),
)

/**
 * @description Get all estimates for a repair request.
 */
repairRouter.get(
  '/:id/estimates',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const estimates = await getRepairEstimates(req.user!, id)
    res.status(200).json({
      success: true,
      data: { estimates },
    })
  }),
)

/**
 * @description Select and accept an estimate (Customer only).
 */
repairRouter.post(
  '/:id/select-estimate',
  requireRole('customer'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const parsed = selectEstimateSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Estimate ID is required.', 400)
    }

    const result = await selectVendorEstimate(req.user!, id, parsed.data.estimateId)
    res.status(200).json({
      success: true,
      data: result,
      message: 'Estimate accepted and vendor assigned successfully.',
    })
  }),
)

/**
 * @description Customer rejects a pending vendor estimate.
 */
repairRouter.post(
  '/:id/estimates/:estimateId/reject',
  requireRole('customer'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawRepairId = req.params.id
    const repairId = Array.isArray(rawRepairId) ? rawRepairId[0] : rawRepairId
    const rawEstimateId = req.params.estimateId
    const estimateId = Array.isArray(rawEstimateId) ? rawEstimateId[0] : rawEstimateId
    if (!repairId || !estimateId) {
      throw new AppError('Repair ID and estimate ID are required.', 400)
    }

    const parsed = rejectEstimateSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid reject payload.', 400)
    }

    const estimate = await rejectVendorEstimate(
      req.user!,
      repairId,
      estimateId,
      parsed.data.reason,
    )
    res.status(200).json({
      success: true,
      data: { estimate },
      message: 'Estimate rejected.',
    })
  }),
)

/**
 * @description Vendor withdraws their pending preliminary estimate.
 */
repairRouter.post(
  '/:id/estimates/:estimateId/withdraw',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawRepairId = req.params.id
    const repairId = Array.isArray(rawRepairId) ? rawRepairId[0] : rawRepairId
    const rawEstimateId = req.params.estimateId
    const estimateId = Array.isArray(rawEstimateId) ? rawEstimateId[0] : rawEstimateId
    if (!repairId || !estimateId) {
      throw new AppError('Repair ID and estimate ID are required.', 400)
    }

    const estimate = await withdrawVendorEstimate(req.user!, repairId, estimateId)
    res.status(200).json({
      success: true,
      data: { estimate },
      message: 'Estimate withdrawn. You can submit a new proposal when ready.',
    })
  }),
)

/**
 * @description Vendor updates a pending preliminary estimate.
 */
repairRouter.patch(
  '/:id/estimates/:estimateId',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawRepairId = req.params.id
    const repairId = Array.isArray(rawRepairId) ? rawRepairId[0] : rawRepairId
    const rawEstimateId = req.params.estimateId
    const estimateId = Array.isArray(rawEstimateId) ? rawEstimateId[0] : rawEstimateId
    if (!repairId || !estimateId) {
      throw new AppError('Repair ID and estimate ID are required.', 400)
    }

    const parsed = updateEstimateSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid estimate data.', 400)
    }

    const estimate = await updateVendorEstimate(req.user!, repairId, estimateId, parsed.data)
    res.status(200).json({
      success: true,
      data: { estimate },
      message: 'Estimate updated successfully.',
    })
  }),
)

/**
 * @description Submit diagnostic inspection findings and itemized quotation (Vendor only).
 */
repairRouter.post(
  '/:id/diagnosis',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const parsed = createQuotationSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid quotation data.', 400)
    }

    const result = await submitDiagnosticQuotation(req.user!, id, parsed.data)
    res.status(201).json({
      success: true,
      data: result,
      message: 'Diagnostic findings and itemized quotation submitted successfully.',
    })
  }),
)

/**
 * @description Get the itemized quotation for a repair request.
 */
repairRouter.get(
  '/:id/quotation',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const quotation = await getQuotationForRepair(req.user!, id)
    res.status(200).json({
      success: true,
      data: { quotation },
    })
  }),
)

/**
 * @description Customer approval or rejection of an itemized diagnostic quotation.
 */
repairRouter.post(
  '/:id/quotation/decision',
  requireRole('customer'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const parsed = quotationDecisionSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid quotation decision payload.', 400)
    }

    const result = await decideQuotation(req.user!, id, parsed.data)
    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    })
  }),
)

/**
 * @description Vendor withdraws a pending diagnostic quotation.
 */
repairRouter.post(
  '/:id/quotation/withdraw',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const result = await withdrawDiagnosticQuotation(req.user!, id)
    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    })
  }),
)

/**
 * @description Vendor starts physical repair work after customer quote approval.
 */
repairRouter.post(
  '/:id/repair-work/start',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const parsed = startRepairWorkSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid repair start payload.', 400)
    }

    const result = await startRepairWork(req.user!, id, parsed.data)
    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    })
  }),
)

/**
 * @description Vendor uploads after-repair proof and marks device ready for pickup.
 */
repairRouter.post(
  '/:id/repair-work/completion',
  requireRole('vendor'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const parsed = submitRepairCompletionSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid completion payload.', 400)
    }

    const result = await submitRepairCompletionProof(req.user!, id, parsed.data)
    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    })
  }),
)

/**
 * @description Customer confirms pickup and closes the repair ticket.
 */
repairRouter.post(
  '/:id/repair-work/confirm-pickup',
  requireRole('customer'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Repair ID is required.', 400)
    }

    const result = await confirmRepairPickup(req.user!, id)
    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    })
  }),
)

