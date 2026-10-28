import mongoose from 'mongoose'

import { env } from './env.js'

/**
 * @description Connects to MongoDB when a URI is configured.
 * @async
 * @returns {Promise<void>} Resolves when connected or when URI is omitted (local/tests).
 * @throws {Error} When connection fails and a URI was provided.
 */
export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) {
    console.warn(
      '[database] MONGODB_URI is not set — skipping MongoDB connection.',
    )
    return
  }

  await mongoose.connect(env.MONGODB_URI)
  console.info('[database] Connected to MongoDB.')
}

/**
 * @description Closes the Mongoose connection if open.
 * @async
 * @returns {Promise<void>} Resolves when disconnected or never connected.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}
