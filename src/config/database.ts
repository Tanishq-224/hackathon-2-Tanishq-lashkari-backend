import mongoose from 'mongoose'

import { env } from './env.js'

export type DatabaseDiagnostics = {
  connected: boolean
  readyState: number
  host?: string
  databaseName?: string
  mode: 'mongodb' | 'in-memory'
}

/**
 * @description Returns safe database connection diagnostics without exposing credentials.
 * @returns {DatabaseDiagnostics} Safe diagnostics object.
 */
export function getDatabaseDiagnostics(): DatabaseDiagnostics {
  const isConnected = mongoose.connection.readyState === 1
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
    host: isConnected ? mongoose.connection.host : undefined,
    databaseName: isConnected ? mongoose.connection.name : undefined,
    mode: isConnected ? 'mongodb' : 'in-memory',
  }
}

/**
 * @description Connects to MongoDB when a URI is configured.
 * In production, MONGODB_URI is strictly required and must not point to localhost.
 * @async
 * @returns {Promise<void>} Resolves when connected or when URI is omitted (local dev / tests).
 * @throws {Error} When connection fails or when required production configuration is missing.
 */
export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) {
    if (env.NODE_ENV === 'production') {
      const errorMsg =
        '[database] Fatal: MONGODB_URI is required in production mode. Refusing to run in-memory.'
      console.error(errorMsg)
      throw new Error(errorMsg)
    }
    console.warn(
      '[database] MONGODB_URI is not set — running in in-memory mode.',
    )
    return
  }

  if (env.NODE_ENV === 'production') {
    if (
      env.MONGODB_URI.includes('localhost') ||
      env.MONGODB_URI.includes('127.0.0.1')
    ) {
      const errorMsg =
        '[database] Fatal: Production MONGODB_URI cannot point to localhost or 127.0.0.1. A cloud database URI (e.g. MongoDB Atlas) is required.'
      console.error(errorMsg)
      throw new Error(errorMsg)
    }
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI)
    console.info(
      `[database] Connected to MongoDB host: ${conn.connection.host}, database: ${conn.connection.name}`,
    )
  } catch (error) {
    console.error('[database] Failed to connect to MongoDB:', error)
    throw error
  }
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
