import { Router } from 'express'

import { env } from '../config/env.js'

export const healthRouter = Router()

/**
 * @description Liveness endpoint for deploys and integration tests.
 */
healthRouter.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Repairex API is running',
    data: {
      environment: env.NODE_ENV,
    },
  })
})
