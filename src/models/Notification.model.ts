import mongoose, { Schema, type InferSchemaType } from 'mongoose'

export const NOTIFICATION_TYPES = [
  'estimate_received',
  'vendor_assigned',
  'quotation_ready',
  'quote_approved',
  'quote_declined',
  'repair_ready_pickup',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    repairRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'RepairRequest',
      required: false,
    },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
)

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & {
  _id: mongoose.Types.ObjectId
}

export const NotificationModel =
  mongoose.models.Notification ??
  mongoose.model('Notification', notificationSchema)
