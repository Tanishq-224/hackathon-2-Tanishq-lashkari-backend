import { Router } from 'express'

import { contactRouter } from './contact.routes.js'
import { healthRouter } from './health.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/contact', contactRouter)
