import mongoose, { Schema, type InferSchemaType } from 'mongoose'

export const CONTACT_MESSAGE_STATUSES = ['new', 'in_progress', 'resolved'] as const
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number]

const contactMessageSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 24 },
    topic: {
      type: String,
      enum: ['platform', 'vendor', 'other'],
      required: true,
    },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: CONTACT_MESSAGE_STATUSES,
      default: 'new',
      required: true,
    },
    internalNote: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
)

export type ContactMessageDocument = InferSchemaType<typeof contactMessageSchema> & {
  _id: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export const ContactMessageModel =
  mongoose.models.ContactMessage ??
  mongoose.model('ContactMessage', contactMessageSchema)
