import { z } from 'zod'

import { CONTACT_MESSAGE_STATUSES } from '../models/ContactMessage.model.js'
import { contactTopics } from './contactMessage.schema.js'

export const adminContactListQuerySchema = z.object({
  status: z.enum(CONTACT_MESSAGE_STATUSES).optional(),
  topic: z.enum(contactTopics).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const adminContactUpdateSchema = z
  .object({
    status: z.enum(CONTACT_MESSAGE_STATUSES).optional(),
    internalNote: z.string().trim().max(2000).optional(),
  })
  .refine((data) => data.status !== undefined || data.internalNote !== undefined, {
    message: 'Provide status and/or internalNote to update.',
  })
