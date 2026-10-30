import type { Server } from 'socket.io'

import { findEstimatesByRepairRequestId } from '../repositories/estimate.repository.js'
import { findRepairRequestById } from '../repositories/repair.repository.js'

let io: Server | null = null

/**
 * @description Registers the Socket.IO server instance for lifecycle broadcasts.
 * @param {Server} server - Initialized Socket.IO server.
 */
export function setRealtimeServer(server: Server): void {
  io = server
}

/**
 * @description Returns the active Socket.IO server when the HTTP server is running.
 */
export function getRealtimeServer(): Server | null {
  return io
}

/**
 * @description Emits an event to a user's private room.
 */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload)
}

/**
 * @description Prompts clients to refetch the notification inbox.
 */
export function notifyUserInbox(userId: string): void {
  emitToUser(userId, 'inbox:update', { at: Date.now() })
}

/**
 * @description Notifies vendor clients that the marketplace feed changed.
 */
export function notifyMarketplaceRefresh(): void {
  io?.to('role:vendor').emit('marketplace:updated', { at: Date.now() })
}

/**
 * @description Notifies everyone watching a repair ticket to refetch detail/estimates/quotes.
 * @async
 */
export async function broadcastRepairRefresh(
  repairRequestId: string,
  reason = 'updated',
): Promise<void> {
  if (!io) {
    return
  }

  const repair = await findRepairRequestById(repairRequestId)
  if (!repair) {
    return
  }

  const payload = { repairRequestId, reason }

  io.to(`repair:${repairRequestId}`).emit('repair:updated', payload)
  emitToUser(repair.customerId, 'repair:updated', payload)

  if (repair.assignedVendorId) {
    emitToUser(repair.assignedVendorId, 'repair:updated', payload)
  }

  const estimates = await findEstimatesByRepairRequestId(repairRequestId)
  for (const estimate of estimates) {
    emitToUser(estimate.vendorId, 'repair:updated', payload)
  }
}

/**
 * @description Fire-and-forget repair broadcast for API handlers.
 */
export function queueRepairRefresh(repairRequestId: string, reason?: string): void {
  void broadcastRepairRefresh(repairRequestId, reason).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[realtime] repair refresh failed:', message)
  })
}
