import { z } from 'zod'

import {
  DEVICE_TYPES,
  ISSUE_CATEGORIES,
  URGENCIES,
} from '../models/RepairRequest.model.js'
import {
  deviceBrandField,
  deviceModelField,
  longTextField,
  positiveMoneyField,
} from '../validation/fields.js'

export const createRepairSchema = z
  .object({
    deviceType: z.enum(DEVICE_TYPES, {
      error: 'Please select a valid device category.',
    }),
    brand: deviceBrandField,
    modelName: deviceModelField,
    issueCategory: z.enum(ISSUE_CATEGORIES, {
      error: 'Please select a valid issue category.',
    }),
    description: longTextField(10, 3000, 'Description'),
    images: z
      .array(
        z.object({
          url: z.string().min(1, 'Image URL cannot be empty.'),
          publicId: z.string().optional(),
        }),
      )
      .max(5, 'You can upload up to 5 images.')
      .default([]),
    urgency: z.enum(URGENCIES).default('medium'),
    estimatedBudgetMin: positiveMoneyField.optional(),
    estimatedBudgetMax: positiveMoneyField.optional(),
  })
  .refine(
    (data) => {
      if (data.estimatedBudgetMin == null || data.estimatedBudgetMax == null) {
        return true
      }
      return data.estimatedBudgetMax >= data.estimatedBudgetMin
    },
    {
      message: 'Maximum budget must be greater than or equal to minimum budget.',
      path: ['estimatedBudgetMax'],
    },
  )

export type CreateRepairInput = z.infer<typeof createRepairSchema>

export const uploadImageSchema = z.object({
  imageData: z
    .string()
    .min(1, 'Image data (base64 data URI or image buffer) is required.'),
})
