import { Router } from 'express'

import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.js'
import {
  getUserNotifications,
  readAllNotifications,
  readNotification,
} from '../services/notification.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { AppError } from '../utils/AppError.js'

export const notificationRouter = Router()

notificationRouter.use(requireAuth)

notificationRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await getUserNotifications(req.user!.id)
    res.json({ success: true, data })
  }),
)

notificationRouter.post(
  '/read-all',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await readAllNotifications(req.user!.id)
    res.json({ success: true, data: result })
  }),
)

notificationRouter.patch(
  '/:id/read',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawId = req.params.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) {
      throw new AppError('Notification ID is required.', 400)
    }

    const notification = await readNotification(req.user!.id, id)
    res.json({ success: true, data: { notification } })
  }),
)
