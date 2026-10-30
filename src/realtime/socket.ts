import { parseCookie } from 'cookie'
import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'

import { getAllowedOrigins, env } from '../config/env.js'
import { findUserByEmail } from '../repositories/auth.repository.js'
import { getSessionCookieName } from '../services/session.service.js'
import { verifySessionToken } from '../services/session.service.js'
import { setRealtimeServer } from './realtime.service.js'

type SocketUser = {
  id: string
  role: 'customer' | 'vendor' | 'admin'
}

/**
 * @description Attaches Socket.IO to the HTTP server with cookie session auth.
 * @param {HttpServer} httpServer - Node HTTP server wrapping Express.
 * @returns {Server} Configured Socket.IO instance.
 */
export function initSocketServer(httpServer: HttpServer): Server {
  const allowedOrigins = getAllowedOrigins(env.CLIENT_URL)

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    path: '/socket.io',
  })

  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie
      if (!rawCookie) {
        next(new Error('Not authenticated'))
        return
      }

      const parsed = parseCookie(rawCookie)
      const token = parsed[getSessionCookieName()]
      if (!token) {
        next(new Error('Not authenticated'))
        return
      }

      const payload = verifySessionToken(token)
      if (!payload) {
        next(new Error('Session expired'))
        return
      }

      const user = await findUserByEmail(payload.email)
      if (!user || !user.emailVerified) {
        next(new Error('Not authenticated'))
        return
      }

      socket.data.user = {
        id: user.id,
        role: user.role,
      } satisfies SocketUser

      next()
    } catch (error) {
      next(error instanceof Error ? error : new Error('Auth failed'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser
    void socket.join(`user:${user.id}`)
    void socket.join(`role:${user.role}`)

    socket.on('repair:subscribe', (repairId: unknown) => {
      if (typeof repairId === 'string' && repairId.trim().length > 0) {
        void socket.join(`repair:${repairId}`)
      }
    })

    socket.on('repair:unsubscribe', (repairId: unknown) => {
      if (typeof repairId === 'string' && repairId.trim().length > 0) {
        void socket.leave(`repair:${repairId}`)
      }
    })
  })

  setRealtimeServer(io)
  console.info('[realtime] Socket.IO ready on /socket.io')

  return io
}
