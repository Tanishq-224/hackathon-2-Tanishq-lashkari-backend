import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },
    passwordHash: { type: String, required: false, default: '' },
    googleId: { type: String, sparse: true },
    role: {
      type: String,
      enum: ['customer', 'vendor'],
      required: true,
      default: 'customer',
    },
    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId
}

/**
 * @description Mongoose user model (used when MongoDB is connected).
 */
export const UserModel =
  mongoose.models.User ?? mongoose.model('User', userSchema)
