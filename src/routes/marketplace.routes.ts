import { Router } from 'express'

import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js'
import { marketplaceFeedQuerySchema } from '../schemas/marketplaceQuery.schema.js'
import { getMarketplaceFeed } from '../services/estimate.service.js'
import { AppError } from '../utils/AppError.js'
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
    const parsed = marketplaceFeedQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      throw new AppError(
        `Invalid query: ${firstIssue?.message ?? 'validation failed'}`,
        400,
      )
    }

    const feed = await getMarketplaceFeed(parsed.data)
    res.status(200).json({
      success: true,
      data: { requests: feed },
    })
  }),
)

