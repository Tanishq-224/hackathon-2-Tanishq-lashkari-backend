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
  selectEstimateSchema,
} from '../schemas/estimate.schema.js'
import {
  createQuotationSchema,
  quotationDecisionSchema,
} from '../schemas/quotation.schema.js'
import { uploadRepairImage } from '../services/cloudinary.service.js'
import {
  createCustomerRepairRequest,
  getCustomerRepairRequests,
  getRepairRequestDetails,
} from '../services/repair.service.js'
import {
  getRepairEstimates,
  selectVendorEstimate,
  submitVendorEstimate,
} from '../services/estimate.service.js'
import {
  decideQuotation,
  getQuotationForRepair,
  submitDiagnosticQuotation,
} from '../services/quotation.service.js'
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
 * @description Get all repair requests for current authenticated customer.
 */
repairRouter.get(
  '/',
  requireRole('customer'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const repairs = await getCustomerRepairRequests(req.user!.id)
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

