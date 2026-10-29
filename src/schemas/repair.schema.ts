import { z } from 'zod'

import {
  DEVICE_TYPES,
  ISSUE_CATEGORIES,
  URGENCIES,
} from '../models/RepairRequest.model.js'

export const createRepairSchema = z.object({
  deviceType: z.enum(DEVICE_TYPES, {
    error: 'Please select a valid device category.',
  }),
  brand: z
    .string()
    .trim()
    .min(1, 'Device brand is required.')
    .max(60, 'Brand name cannot exceed 60 characters.'),
  modelName: z
    .string()
    .trim()
    .min(1, 'Device model is required.')
    .max(100, 'Model name cannot exceed 100 characters.'),
  issueCategory: z.enum(ISSUE_CATEGORIES, {
    error: 'Please select a valid issue category.',
  }),
  description: z
    .string()
    .trim()
    .min(10, 'Please describe the problem in at least 10 characters.')
    .max(3000, 'Description cannot exceed 3000 characters.'),
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
  estimatedBudgetMin: z.coerce.number().positive().optional(),
  estimatedBudgetMax: z.coerce.number().positive().optional(),
})

export type CreateRepairInput = z.infer<typeof createRepairSchema>

export const uploadImageSchema = z.object({
  imageData: z
    .string()
    .min(1, 'Image data (base64 data URI or image buffer) is required.'),
})

