import { Router } from 'express'

import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js'
import type { DeviceType, Urgency } from '../models/RepairRequest.model.js'
import { getMarketplaceFeed } from '../services/estimate.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const marketplaceRouter = Router()

// Only authenticated vendors and admins can browse the marketplace feed
marketplaceRouter.use(requireAuth)
marketplaceRouter.use(requireRole('vendor'))

/**
 * @description Browse open customer repair requests available for bidding.
 */
marketplaceRouter.get(
  '/repairs',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const deviceType = req.query.deviceType as DeviceType | undefined
    const urgency = req.query.urgency as Urgency | undefined

    const feed = await getMarketplaceFeed({ deviceType, urgency })
    res.status(200).json({
      success: true,
      data: { requests: feed },
    })
  }),
)

