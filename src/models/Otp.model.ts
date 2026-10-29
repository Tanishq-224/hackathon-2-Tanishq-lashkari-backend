import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const otpSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },
    purpose: {
      type: String,
      enum: ['signup', 'reset'],
      required: true,
    },
    hash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  { timestamps: true },
)

otpSchema.index({ email: 1, purpose: 1 }, { unique: true })

export type OtpDocument = InferSchemaType<typeof otpSchema> & {
  _id: mongoose.Types.ObjectId
}

/**
 * @description Mongoose OTP challenge model with automatic TTL expiry.
 */
export const OtpModel =
  mongoose.models.Otp ?? mongoose.model('Otp', otpSchema)
