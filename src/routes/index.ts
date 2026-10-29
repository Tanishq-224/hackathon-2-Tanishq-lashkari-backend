import { Router } from 'express'

import { authRouter } from './auth.routes.js'
import { contactRouter } from './contact.routes.js'
import { healthRouter } from './health.routes.js'

export const apiRouter = Router()

apiRouter.use('/health', healthRouter)
apiRouter.use('/auth', authRouter)
apiRouter.use('/contact', contactRouter)
