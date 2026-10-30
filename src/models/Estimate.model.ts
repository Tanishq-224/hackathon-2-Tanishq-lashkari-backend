import mongoose, { Schema, type InferSchemaType } from 'mongoose'

export const ESTIMATE_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

const estimateComponentLineSchema = new Schema(
  {
    component: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0.01 },
    warrantyMonths: { type: Number, required: true, min: 0, max: 60 },
  },
  { _id: false },
)

const estimateSchema = new Schema(
  {
    repairRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'RepairRequest',
      required: true,
      index: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendorName: {
      type: String,
      required: true,
      trim: true,
    },
    vendorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    minCost: {
      type: Number,
      required: true,
      min: 1,
    },
    maxCost: {
      type: Number,
      required: true,
      min: 1,
    },
    turnaroundTime: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    warrantyMonths: {
      type: Number,
      required: true,
      min: 0,
      max: 60,
      default: 3,
    },
    notes: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000,
    },
    componentLines: {
      type: [estimateComponentLineSchema],
      default: undefined,
    },
    labourCost: {
      type: Number,
      min: 0,
      default: undefined,
    },
    status: {
      type: String,
      enum: ESTIMATE_STATUSES,
      default: 'pending',
      index: true,
    },
    declineReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
  },
  { timestamps: true },
)

// Prevent duplicate estimates from the same vendor on the same repair request
estimateSchema.index({ repairRequestId: 1, vendorId: 1 }, { unique: true })

export type EstimateDocument = InferSchemaType<typeof estimateSchema> & {
  _id: mongoose.Types.ObjectId
}

export const EstimateModel =
  mongoose.models.Estimate ??
  mongoose.model('Estimate', estimateSchema)

