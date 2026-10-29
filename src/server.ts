import { env } from './config/env.js'
import { createApp } from './app.js'
import { connectDatabase } from './config/database.js'
import { verifyEmailTransport } from './services/email.service.js'

/**
 * @description Boots the HTTP server and optional MongoDB connection.
 * @async
 * @returns {Promise<void>} Resolves when the server is listening.
 */
async function startServer(): Promise<void> {
  await connectDatabase()
  await verifyEmailTransport()

  const app = createApp()

  app.listen(env.PORT, () => {
    console.info(
      `[server] Repairex API listening on http://localhost:${env.PORT}`,
    )
    console.info(`[server] Swagger UI: http://localhost:${env.PORT}/api-docs`)
  })
}

startServer().catch((error: unknown) => {
  console.error('[server] Failed to start:', error)
  process.exit(1)
})
