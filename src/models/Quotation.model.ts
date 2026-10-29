import mongoose, { Schema, type InferSchemaType } from 'mongoose'

export const LINE_ITEM_CATEGORIES = ['parts', 'labor', 'consumable', 'other'] as const
export type LineItemCategory = (typeof LINE_ITEM_CATEGORIES)[number]

export const QUOTATION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number]

const lineItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    category: { type: String, enum: LINE_ITEM_CATEGORIES, default: 'parts' },
    cost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const quotationSchema = new Schema(
  {
    repairRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'RepairRequest',
      required: true,
      unique: true,
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
    diagnosticFindings: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 3000,
    },
    lineItems: {
      type: [lineItemSchema],
      required: true,
      validate: [(val: unknown[]) => val.length >= 1, 'Must include at least one itemized line item'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedCompletion: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: QUOTATION_STATUSES,
      default: 'pending',
      index: true,
    },
    customerDecisionAt: {
      type: Date,
      required: false,
    },
    customerFeedback: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true },
)

export type QuotationDocument = InferSchemaType<typeof quotationSchema> & {
  _id: mongoose.Types.ObjectId
}

export const QuotationModel =
  mongoose.models.Quotation ?? mongoose.model('Quotation', quotationSchema)

