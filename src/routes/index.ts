import { Router } from 'express'

import { authRouter } from './auth.routes.js'
import { contactRouter } from './contact.routes.js'
import { healthRouter } from './health.routes.js'
import { marketplaceRouter } from './marketplace.routes.js'
import { notificationRouter } from './notification.routes.js'
import { repairRouter } from './repair.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.use('/contact', contactRouter)
apiRouter.use('/repairs', repairRouter)
apiRouter.use('/marketplace', marketplaceRouter)
apiRouter.use('/notifications', notificationRouter)
