import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'

import { env } from './config/env.js'
import openApiDocument from './docs/openapi.json' with { type: 'json' }
import { errorHandler } from './middleware/errorHandler.js'
import { notFoundHandler } from './middleware/notFoundHandler.js'
import { apiRouter } from './routes/index.js'

/**
 * @description Builds the Express application without starting the HTTP server.
 * @returns {express.Application} Configured Express app (used by server and tests).
 */
export function createApp(): express.Application {
  const app = express()

  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  )
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  )

  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use(cookieParser())

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))
  app.use('/api', apiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
