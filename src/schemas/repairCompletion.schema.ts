import { z } from 'zod'

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
    .refine((val) => val === undefined || val.length === 0 || val.length >= 10, {
      message: 'Please add at least 10 characters of bench notes for the repair log.',
    }),
})

export const submitRepairCompletionSchema = z.object({
  afterRepairImages: z
    .array(imageAttachmentSchema)
    .min(1, 'Upload at least one after-repair proof photo.')
    .max(5, 'You can upload up to 5 after-repair photos.'),
  resolutionSummary: z
    .string()
    .trim()
    .min(10, 'Please summarize the repair outcome in at least 10 characters.')
    .max(3000, 'Resolution summary cannot exceed 3000 characters.'),
})

export type StartRepairWorkInput = z.infer<typeof startRepairWorkSchema>
export type SubmitRepairCompletionInput = z.infer<typeof submitRepairCompletionSchema>
