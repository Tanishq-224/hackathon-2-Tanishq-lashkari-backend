import { z } from 'zod'

import { longTextField } from '../validation/fields.js'

const imageAttachmentSchema = z.object({
  url: z.string().min(1, 'Image URL cannot be empty.'),
  publicId: z.string().optional(),
})

export const startRepairWorkSchema = z.object({
  repairBenchNotes: z
    .string()
    .trim()
    .max(2000, 'Bench notes cannot exceed 2000 characters.')
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((val) => val === undefined || val.length >= 10, {
      message: 'Please add at least 10 characters of bench notes for the repair log.',
    }),
})

export const submitRepairCompletionSchema = z.object({
  afterRepairImages: z
    .array(imageAttachmentSchema)
    .min(1, 'Upload at least one after-repair proof photo.')
    .max(5, 'You can upload up to 5 after-repair photos.'),
  resolutionSummary: longTextField(10, 3000, 'Resolution summary'),
})

export type StartRepairWorkInput = z.infer<typeof startRepairWorkSchema>
export type SubmitRepairCompletionInput = z.infer<typeof submitRepairCompletionSchema>
