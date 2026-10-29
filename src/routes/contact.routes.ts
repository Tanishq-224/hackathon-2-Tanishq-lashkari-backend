import { Router } from 'express'

import { contactMessageSchema } from '../schemas/contactMessage.schema.js'
import { AppError } from '../utils/AppError.js'

export const contactRouter = Router()

/**
 * @description Accepts a public contact form submission and acknowledges receipt.
 */
contactRouter.post('/', (req, res) => {
  const parsed = contactMessageSchema.safeParse(req.body)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const field = firstIssue?.path.join('.') ?? 'body'
    throw new AppError(`Invalid ${field}: ${firstIssue?.message ?? 'validation failed'}`, 400)
  }

  const payload = parsed.data

  console.info('[contact] New message', {
    topic: payload.topic,
    email: payload.email,
    fullName: payload.fullName,
  })

  res.status(201).json({
    success: true,
    message: 'Thanks — your message was received. Our team will follow up using the contact details you provided.',
    data: {
      receivedAt: new Date().toISOString(),
    },
  })
})
