import { Router } from 'express'

import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js'
import {
  adminContactListQuerySchema,
  adminContactUpdateSchema,
} from '../schemas/adminContact.schema.js'
import {
  findContactMessageById,
  listContactMessages,
  updateContactMessageAdminFields,
} from '../repositories/contactMessage.repository.js'
import { AppError } from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const adminRouter = Router()

adminRouter.use(requireAuth, requireRole('admin'))

adminRouter.get(
  '/contact-messages',
  asyncHandler(async (req, res) => {
    const parsed = adminContactListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid query parameters.', 400)
    }

    const result = await listContactMessages(parsed.data)

    res.json({
      success: true,
      data: result,
    })
  }),
)

adminRouter.get(
  '/contact-messages/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const message = await findContactMessageById(id)
    if (!message) {
      throw new AppError('Contact message not found.', 404)
    }

    res.json({
      success: true,
      data: { message },
    })
  }),
)

adminRouter.patch(
  '/contact-messages/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = adminContactUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError(issue?.message ?? 'Invalid update payload.', 400)
    }

    const id = String(req.params.id)
    const updated = await updateContactMessageAdminFields(id, parsed.data)
    if (!updated) {
      throw new AppError('Contact message not found.', 404)
    }

    res.json({
      success: true,
      message: 'Contact message updated.',
      data: { message: updated },
    })
  }),
)
