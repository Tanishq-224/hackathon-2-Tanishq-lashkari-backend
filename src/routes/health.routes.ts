import { Router } from 'express'

import { getDatabaseDiagnostics } from '../config/database.js'
import { env } from '../config/env.js'

export const healthRouter = Router()

/**
 * @description Liveness endpoint for deploys and integration tests.
 * Surfaces safe database diagnostics (host and db name, never credentials).
 */
healthRouter.get('/', (_req, res) => {
  const dbStatus = getDatabaseDiagnostics()
  res.status(200).json({
    success: true,
    message: 'Repairex API is running',
    data: {
      environment: env.NODE_ENV,
      database: dbStatus,
    },
  })
})
