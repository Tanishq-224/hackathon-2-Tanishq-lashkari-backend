import { z } from 'zod'

import { DEVICE_TYPES, URGENCIES } from '../models/RepairRequest.model.js'

/**
 * @description Validates optional marketplace feed query filters.
 */
export const marketplaceFeedQuerySchema = z.object({
  deviceType: z.enum(DEVICE_TYPES).optional(),
  urgency: z.enum(URGENCIES).optional(),
})

export type MarketplaceFeedQuery = z.infer<typeof marketplaceFeedQuerySchema>
