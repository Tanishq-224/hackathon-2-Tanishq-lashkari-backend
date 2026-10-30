import { notifyUserInbox, queueRepairRefresh } from '../realtime/realtime.service.js'
import { findUserById } from '../repositories/auth.repository.js'
import { createNotification } from '../repositories/notification.repository.js'
import type { NotificationType } from '../models/Notification.model.js'
import { buildLifecycleEmailHtml } from '../templates/email.template.js'
import { sendTransactionalEmail } from './email.service.js'
import { env } from '../config/env.js'

type LifecyclePayload = {
  userId: string
  type: NotificationType
  title: string
  message: string
  repairRequestId?: string
  emailSubject: string
  emailText: string
}

/**
 * @description Builds a deep link to the repair detail page on the client app.
 * @param {string} [repairRequestId] - Repair ticket ID.
 * @returns {string} Absolute or relative dashboard URL.
 */
function repairDetailUrl(repairRequestId?: string): string {
  const base = env.CLIENT_URL.split(',')[0]?.trim() || 'http://localhost:5173'
  const origin = base.replace(/\/+$/, '')
  if (!repairRequestId) {
    return `${origin}/dashboard`
  }
  return `${origin}/dashboard/repairs/${repairRequestId}`
}

/**
 * @description Sends lifecycle email + in-app notification without blocking the caller.
 * @async
 * @param {LifecyclePayload} payload - Notification and email content.
 */
export async function dispatchLifecycleUpdate(payload: LifecyclePayload): Promise<void> {
  await createNotification({
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    repairRequestId: payload.repairRequestId,
  })

  notifyUserInbox(payload.userId)
  if (payload.repairRequestId) {
    queueRepairRefresh(payload.repairRequestId, 'lifecycle')
  }

  const user = await findUserById(payload.userId)
  if (!user?.email) {
    return
  }

  const link = repairDetailUrl(payload.repairRequestId)
  const text = `${payload.emailText}\n\nOpen in Repairex: ${link}`

  const headline = payload.emailSubject.replace(/^Repairex\s*[—-]\s*/i, '').trim()

  await sendTransactionalEmail({
    to: user.email,
    subject: payload.emailSubject,
    text,
    html: buildLifecycleEmailHtml({
      headline: headline || payload.title,
      bodyText: payload.emailText,
      dashboardUrl: link,
    }),
  })
}

/**
 * @description Fire-and-forget wrapper so API handlers stay fast if email fails.
 * @param {LifecyclePayload} payload - Lifecycle event payload.
 */
export function queueLifecycleUpdate(payload: LifecyclePayload): void {
  void dispatchLifecycleUpdate(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[lifecycle-notify] Failed to deliver update:', message)
  })
}

/**
 * @description Notifies customer that a vendor submitted a preliminary estimate.
 */
export function notifyCustomerEstimateReceived(input: {
  customerId: string
  repairRequestId: string
  vendorName: string
  deviceLabel: string
}): void {
  queueLifecycleUpdate({
    userId: input.customerId,
    type: 'estimate_received',
    title: 'New repair estimate',
    message: `${input.vendorName} sent an estimate for your ${input.deviceLabel}.`,
    repairRequestId: input.repairRequestId,
    emailSubject: 'Repairex — New vendor estimate on your repair',
    emailText: `${input.vendorName} submitted a preliminary estimate for your ${input.deviceLabel}. Sign in to compare quotes and choose a technician.`,
  })
}

/**
 * @description Notifies vendor that customer selected their estimate.
 */
export function notifyVendorAssigned(input: {
  vendorId: string
  repairRequestId: string
  deviceLabel: string
}): void {
  queueLifecycleUpdate({
    userId: input.vendorId,
    type: 'vendor_assigned',
    title: 'Customer selected you',
    message: `You were assigned to repair ${input.deviceLabel}. Run bench diagnosis next.`,
    repairRequestId: input.repairRequestId,
    emailSubject: 'Repairex — Customer assigned you to a repair',
    emailText: `A customer selected your estimate for ${input.deviceLabel}. Open your vendor portal to submit physical diagnosis and an itemized quote.`,
  })
}

/**
 * @description Notifies customer that itemized quotation is ready for review.
 */
export function notifyCustomerQuotationReady(input: {
  customerId: string
  repairRequestId: string
  vendorName: string
  totalAmount: number
  deviceLabel: string
}): void {
  queueLifecycleUpdate({
    userId: input.customerId,
    type: 'quotation_ready',
    title: 'Itemized quote ready',
    message: `${input.vendorName} posted a $${input.totalAmount.toFixed(2)} quotation for your ${input.deviceLabel}.`,
    repairRequestId: input.repairRequestId,
    emailSubject: 'Repairex — Diagnostic quotation ready for approval',
    emailText: `${input.vendorName} completed bench diagnosis on your ${input.deviceLabel}. Review the itemized quote ($${input.totalAmount.toFixed(2)}) and approve or decline before repair begins.`,
  })
}

/**
 * @description Notifies vendor that customer approved the quotation.
 */
export function notifyVendorQuoteApproved(input: {
  vendorId: string
  repairRequestId: string
  deviceLabel: string
  amount: number
}): void {
  queueLifecycleUpdate({
    userId: input.vendorId,
    type: 'quote_approved',
    title: 'Quote approved — start repair',
    message: `Customer authorized $${input.amount.toFixed(2)} for ${input.deviceLabel}.`,
    repairRequestId: input.repairRequestId,
    emailSubject: 'Repairex — Customer approved your repair quote',
    emailText: `The customer approved your itemized quote ($${input.amount.toFixed(2)}) for ${input.deviceLabel}. You can start repair work in the vendor portal.`,
  })
}

/**
 * @description Notifies vendor that customer declined the quotation.
 */
export function notifyVendorQuoteDeclined(input: {
  vendorId: string
  repairRequestId: string
  deviceLabel: string
}): void {
  queueLifecycleUpdate({
    userId: input.vendorId,
    type: 'quote_declined',
    title: 'Quote declined',
    message: `Customer declined the quotation for ${input.deviceLabel}.`,
    repairRequestId: input.repairRequestId,
    emailSubject: 'Repairex — Customer declined the repair quote',
    emailText: `The customer declined the itemized quotation for ${input.deviceLabel}. The ticket was cancelled in Repairex.`,
  })
}

/**
 * @description Notifies customer that device is ready for pickup.
 */
export function notifyCustomerReadyForPickup(input: {
  customerId: string
  repairRequestId: string
  deviceLabel: string
}): void {
  queueLifecycleUpdate({
    userId: input.customerId,
    type: 'repair_ready_pickup',
    title: 'Ready for pickup',
    message: `Your ${input.deviceLabel} repair is complete — confirm pickup in the dashboard.`,
    repairRequestId: input.repairRequestId,
    emailSubject: 'Repairex — Your device is ready for pickup',
    emailText: `Great news! Your ${input.deviceLabel} repair is finished. Review before/after photos and confirm pickup in your Repairex dashboard.`,
  })
}

/**
 * @description Formats device label for lifecycle messages.
 * @param {string} brand - Device brand.
 * @param {string} modelName - Device model.
 * @returns {string} Combined label.
 */
export function formatDeviceLabel(brand: string, modelName: string): string {
  return `${brand} ${modelName}`.trim()
}
