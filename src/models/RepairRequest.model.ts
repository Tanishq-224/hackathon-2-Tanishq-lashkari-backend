import mongoose, { Schema, type InferSchemaType } from 'mongoose'

export const DEVICE_TYPES = [
  'phone',
  'laptop',
  'tablet',
  'audio',
  'smartwatch',
  'other',
] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export const ISSUE_CATEGORIES = [
  'screen',
  'battery',
  'charging',
  'water_damage',
  'audio',
  'software',
  'camera',
  'hardware',
  'other',
] as const
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]

export const REPAIR_STATUSES = [
  'submitted',
  'estimated',
  'vendor_selected',
  'diagnosed',
  'quote_approved',
  'in_repair',
  'ready_for_pickup',
  'completed',
  'cancelled',
] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export const URGENCIES = ['low', 'medium', 'high', 'immediate'] as const
export type Urgency = (typeof URGENCIES)[number]

const imageAttachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: false },
  },
  { _id: false },
)

const repairRequestSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceType: {
      type: String,
      enum: DEVICE_TYPES,
      required: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    modelName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    issueCategory: {
      type: String,
      enum: ISSUE_CATEGORIES,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 3000,
    },
    images: {
      type: [imageAttachmentSchema],
      default: [],
      validate: [
        (val: unknown[]) => val.length <= 5,
        'Cannot exceed 5 image attachments',
      ],
    },
    urgency: {
      type: String,
      enum: URGENCIES,
      default: 'medium',
    },
    status: {
      type: String,
      enum: REPAIR_STATUSES,
      default: 'submitted',
      index: true,
    },
    estimatedBudgetMin: { type: Number, required: false },
    estimatedBudgetMax: { type: Number, required: false },
  },
  { timestamps: true },
)

export type RepairRequestDocument = InferSchemaType<
  typeof repairRequestSchema
> & {
  _id: mongoose.Types.ObjectId
}

export const RepairRequestModel =
  mongoose.models.RepairRequest ??
  mongoose.model('RepairRequest', repairRequestSchema)

