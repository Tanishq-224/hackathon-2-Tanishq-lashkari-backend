import { Router } from 'express'

import { createContactMessage } from '../repositories/contactMessage.repository.js'
import { contactMessageSchema } from '../schemas/contactMessage.schema.js'
import { AppError } from '../utils/AppError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const contactRouter = Router()

/**
 * @description Accepts a public contact form submission and persists it for admin review.
 */
contactRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = contactMessageSchema.safeParse(req.body)

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const field = firstIssue?.path.join('.') ?? 'body'
      throw new AppError(`Invalid ${field}: ${firstIssue?.message ?? 'validation failed'}`, 400)
    }

    const saved = await createContactMessage(parsed.data)

    res.status(201).json({
      success: true,
      message:
        'Thanks — your message was received. Our team will follow up using the contact details you provided.',
      data: {
        id: saved.id,
        receivedAt: saved.createdAt,
      },
    })
  }),
)
